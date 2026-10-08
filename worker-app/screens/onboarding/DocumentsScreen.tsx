import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'


import * as DocumentPicker from 'expo-document-picker'

import { AppButton } from '../../components/ui/AppButton'
import DocumentUploadCard from '../../components/onboarding/DocumentUploadCard'
import ErrorState from '../../components/ui/ErrorState'
import OnboardingProgress from '../../components/onboarding/OnboardingProgress'
import { ScreenContainer } from '../../components/layout/ScreenContainer'

import {
  UI,
} from '../../constants/ui'

import {
  getWorkerDocuments,
  uploadWorkerDocument,
} from '../../services/onboarding/workerDocuments.service'

import {
  saveWorkerOnboarding,
} from '../../services/onboarding/workerOnboarding.service'

import {
  WORKER_DOCUMENT_REQUIREMENTS,
} from '../../types/documents'

import type {
  WorkerDocument,
  WorkerDocumentType,
} from '../../types/documents'

type DocumentsScreenProps = {
  onContinue: () => void
  onBack: () => void
}

type DocumentMap = Record<
  WorkerDocumentType,
  WorkerDocument | null
>

const EMPTY_DOCUMENTS: DocumentMap = {
  passport_photo: null,
  aadhaar: null,
  pan: null,
  address_proof: null,
  police_verification: null,
  bank_account: null,
}

const ONBOARDING_LABELS = [
  'Personal information',
  'Services',
  'Documents',
  'Availability',
  'Consent',
]

function createDocumentMap(
  documents: WorkerDocument[],
): DocumentMap {
  const mapped = {
    ...EMPTY_DOCUMENTS,
  }

  documents.forEach(document => {
    mapped[document.documentType] =
      document
  })

  return mapped
}

function getMimeType(
  value: string | null | undefined,
  fileName: string,
): string {
  if (value) {
    return value
  }

  const normalized =
    fileName.toLowerCase()

  if (normalized.endsWith('.pdf')) {
    return 'application/pdf'
  }

  if (
    normalized.endsWith('.jpg') ||
    normalized.endsWith('.jpeg')
  ) {
    return 'image/jpeg'
  }

  if (normalized.endsWith('.png')) {
    return 'image/png'
  }

  return ''
}

export default function DocumentsScreen({
  onContinue,
  onBack,
}: DocumentsScreenProps) {
  const [documents, setDocuments] =
    useState<DocumentMap>(
      EMPTY_DOCUMENTS,
    )

  const [loading, setLoading] =
    useState(true)

  const [uploadingType, setUploadingType] =
    useState<WorkerDocumentType | null>(
      null,
    )

  const [errorMessage, setErrorMessage] =
    useState('')

  const uploadedCount =
    useMemo(
      () =>
        WORKER_DOCUMENT_REQUIREMENTS.filter(
          requirement =>
            documents[requirement.type] !==
            null,
        ).length,
      [documents],
    )

  const requiredCount =
    WORKER_DOCUMENT_REQUIREMENTS.filter(
      requirement =>
        requirement.required,
    ).length

  const allRequiredUploaded =
    uploadedCount >= requiredCount

  useEffect(() => {
    let mounted = true

    async function loadDocuments() {
      setLoading(true)
      setErrorMessage('')

      try {
        const result =
          await getWorkerDocuments()

        if (!mounted) {
          return
        }

        setDocuments(
          createDocumentMap(result),
        )
      } catch (error) {
        console.error(
          'Unable to load worker documents:',
          error,
        )

        if (!mounted) {
          return
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Unable to load your documents.',
        )
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void loadDocuments()

    return () => {
      mounted = false
    }
  }, [])

  async function handleUpload(
    documentType: WorkerDocumentType,
  ) {
    if (uploadingType) {
      return
    }

    const requirement =
      WORKER_DOCUMENT_REQUIREMENTS.find(
        item =>
          item.type === documentType,
      )

    setErrorMessage('')

    try {
      const result =
        await DocumentPicker.getDocumentAsync(
          {
            type:
              requirement?.photoOnly
                ? [
                    'image/jpeg',
                    'image/png',
                  ]
                : [
                    'image/jpeg',
                    'image/png',
                    'application/pdf',
                  ],

            copyToCacheDirectory: true,

            multiple: false,
          },
        )

      if (
        result.canceled ||
        !result.assets?.length
      ) {
        return
      }

      const asset = result.assets[0]

      const fileName =
        asset.name?.trim()

      if (!fileName) {
        throw new Error(
          'The selected file does not have a valid name.',
        )
      }

      const mimeType =
        getMimeType(
          asset.mimeType,
          fileName,
        )

      if (!mimeType) {
        throw new Error(
          'The selected file type could not be determined.',
        )
      }

      setUploadingType(
        documentType,
      )

      const uploaded =
        await uploadWorkerDocument({
          documentType,
          filePath: asset.uri,
          fileName,
          mimeType,
          fileSize:
            asset.size ?? null,
        })

      setDocuments(
        current => ({
          ...current,
          [documentType]:
            uploaded,
        }),
      )
    } catch (error) {
      console.error(
        'Unable to upload worker document:',
        error,
      )

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to upload the selected document.',
      )
    } finally {
      setUploadingType(null)
    }
  }

  async function handleContinue() {
    if (!allRequiredUploaded) {
      setErrorMessage(
        `Please upload all required documents. ${uploadedCount} of ${requiredCount} are uploaded.`,
      )
      return
    }

    if (uploadingType) {
      return
    }

    setErrorMessage('')

    try {
      await saveWorkerOnboarding({
        onboardingStep: 4,
      })

      onContinue()
    } catch (error) {
      console.error(
        'Unable to save document onboarding step:',
        error,
      )

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to continue to the next step.',
      )
    }
  }

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="large"
            color={UI.colors.primaryBlue}
          />

          <Text style={styles.loadingTitle}>
            Loading your documents
          </Text>

          <Text style={styles.loadingText}>
            Checking your saved verification documents...
          </Text>
        </View>
      </ScreenContainer>
    )
  }

  if (errorMessage && uploadedCount === 0) {
    return (
      <ScreenContainer>
        <ErrorState
          message={errorMessage}
          onAction={() => {
            setErrorMessage('')
            setLoading(true)

            void getWorkerDocuments()
              .then(result => {
                setDocuments(
                  createDocumentMap(
                    result,
                  ),
                )
              })
              .catch(error => {
                setErrorMessage(
                  error instanceof Error
                    ? error.message
                    : 'Unable to load your documents.',
                )
              })
              .finally(() => {
                setLoading(false)
              })
          }}
        />
      </ScreenContainer>
    )
  }

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>
            STEP 3 · DOCUMENTS
          </Text>

          <Text style={styles.title}>
            Verify your worker profile
          </Text>

          <Text style={styles.subtitle}>
            Upload clear copies of the required
            documents. You can replace a document
            later if needed.
          </Text>
        </View>

        <OnboardingProgress
          currentStep={3}
          totalSteps={5}
          labels={ONBOARDING_LABELS}
        />

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>
            Documents uploaded
          </Text>

          <Text style={styles.summaryCount}>
            {uploadedCount} of {requiredCount}
          </Text>

          <Text style={styles.summaryText}>
            All required documents must be uploaded
            before continuing.
          </Text>
        </View>

        {errorMessage ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>
              Upload issue
            </Text>

            <Text style={styles.errorText}>
              {errorMessage}
            </Text>
          </View>
        ) : null}

        <View style={styles.documentList}>
          {WORKER_DOCUMENT_REQUIREMENTS.map(
            requirement => (
              <DocumentUploadCard
                key={requirement.type}
                requirement={
                  requirement
                }
                document={
                  documents[
                    requirement.type
                  ]
                }
                onPress={() => {
                  void handleUpload(
                    requirement.type,
                  )
                }}
                disabled={
                  uploadingType !== null
                }
              />
            ),
          )}
        </View>

        {uploadingType ? (
          <View style={styles.uploadingRow}>
            <ActivityIndicator
              size="small"
              color={UI.colors.primaryBlue}
            />

            <Text style={styles.uploadingText}>
              Uploading document...
            </Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <View style={styles.actionButton}>
            <AppButton
              title="Back"
              variant="secondary"
              onPress={onBack}
              disabled={
                uploadingType !== null
              }
            />
          </View>

          <View style={styles.actionButton}>
            <AppButton
              title="Continue"
              onPress={() => {
                void handleContinue()
              }}
              disabled={
                !allRequiredUploaded ||
                uploadingType !== null
              }
            />
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: UI.spacing.xl,
    paddingTop: UI.spacing.xl,
    paddingBottom: UI.spacing.xxxl,
  },

  header: {
    marginBottom: UI.spacing.lg,
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: UI.colors.primaryBlue,
  },

  title: {
    marginTop: UI.spacing.sm,
    fontSize: UI.typography.title,
    lineHeight: 30,
    fontWeight: '800',
    color: UI.colors.text,
  },

  subtitle: {
    marginTop: UI.spacing.sm,
    fontSize: UI.typography.body,
    lineHeight: 21,
    color: UI.colors.textSecondary,
  },

  summaryCard: {
    marginTop: UI.spacing.lg,
    padding: UI.spacing.lg,
    borderRadius: UI.radius.lg,
    backgroundColor: UI.colors.infoBackground,
    borderWidth: 1,
    borderColor: UI.colors.info,
  },

  summaryTitle: {
    fontSize: UI.typography.small,
    fontWeight: '700',
    color: UI.colors.textSecondary,
  },

  summaryCount: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.subtitle,
    lineHeight: 24,
    fontWeight: '800',
    color: UI.colors.text,
  },

  summaryText: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    lineHeight: 18,
    color: UI.colors.textSecondary,
  },

  errorBox: {
    marginTop: UI.spacing.md,
    padding: UI.spacing.md,
    borderRadius: UI.radius.md,
    backgroundColor:
      UI.colors.errorBackground,
    borderWidth: 1,
    borderColor: UI.colors.errorBackground,
  },

  errorTitle: {
    fontSize: UI.typography.small,
    fontWeight: '800',
    color: UI.colors.error,
  },

  errorText: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    lineHeight: 18,
    color: UI.colors.error,
  },

  documentList: {
    marginTop: UI.spacing.lg,
  },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: UI.spacing.xxl,
  },

  loadingTitle: {
    marginTop: UI.spacing.lg,
    fontSize: UI.typography.subtitle,
    fontWeight: '800',
    color: UI.colors.text,
    textAlign: 'center',
  },

  loadingText: {
    marginTop: UI.spacing.sm,
    fontSize: UI.typography.body,
    lineHeight: 20,
    color: UI.colors.textSecondary,
    textAlign: 'center',
  },

  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: UI.spacing.md,
  },

  uploadingText: {
    marginLeft: UI.spacing.sm,
    fontSize: UI.typography.small,
    color: UI.colors.textSecondary,
  },

  actions: {
    flexDirection: 'row',
    marginTop: UI.spacing.xxl,
  },

  actionButton: {
    flex: 1,
    marginLeft: UI.spacing.sm,
  },
})