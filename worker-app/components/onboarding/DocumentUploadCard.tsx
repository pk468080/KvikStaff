import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import {
  UI,
} from '../../constants/ui'

import type {
  WorkerDocument,
  WorkerDocumentRequirement,
} from '../../types/documents'

type DocumentUploadCardProps = {
  requirement: WorkerDocumentRequirement
  document: WorkerDocument | null
  onPress: () => void
  disabled?: boolean
}

function getStatusLabel(
  document: WorkerDocument | null,
): string {
  if (!document) {
    return 'Not uploaded'
  }

  switch (document.status) {
    case 'approved':
      return 'Approved'

    case 'rejected':
      return 'Rejected'

    case 'pending':
      return 'Under review'

    default:
      return 'Not uploaded'
  }
}

export default function DocumentUploadCard({
  requirement,
  document,
  onPress,
  disabled = false,
}: DocumentUploadCardProps) {
  const status =
    document?.status ?? null

  const statusLabel =
    getStatusLabel(document)

  const statusStyles =
    status === 'approved'
      ? styles.statusApproved
      : status === 'rejected'
        ? styles.statusRejected
        : status === 'pending'
          ? styles.statusPending
          : styles.statusDefault

  const statusTextStyles =
    status === 'approved'
      ? styles.statusTextApproved
      : status === 'rejected'
        ? styles.statusTextRejected
        : status === 'pending'
          ? styles.statusTextPending
          : styles.statusTextDefault

  const fileLabel =
    document?.fileName ??
    'No file selected'

  return (
    <View
      style={[
        styles.container,
        disabled &&
          styles.containerDisabled,
      ]}
    >
      <View style={styles.header}>
        <View style={styles.icon}>
          <Text style={styles.iconText}>
            {requirement.photoOnly
              ? 'IMG'
              : 'DOC'}
          </Text>
        </View>

        <View style={styles.headerCopy}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>
              {requirement.title}
            </Text>

            {requirement.required ? (
              <Text style={styles.required}>
                Required
              </Text>
            ) : null}
          </View>

          <Text style={styles.description}>
            {requirement.description}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.statusBadge,
          statusStyles,
        ]}
      >
        <Text
          style={[
            styles.statusText,
            statusTextStyles,
          ]}
        >
          {statusLabel}
        </Text>
      </View>

      <View style={styles.fileRow}>
        <View style={styles.fileCopy}>
          <Text
            numberOfLines={1}
            style={styles.fileName}
          >
            {fileLabel}
          </Text>

          {document?.fileSize !== null &&
          document?.fileSize !== undefined ? (
            <Text style={styles.fileSize}>
              {formatFileSize(
                document.fileSize,
              )}
            </Text>
          ) : null}
        </View>

        <Pressable
          onPress={onPress}
          disabled={disabled}
          style={({ pressed }) => [
            styles.button,
            disabled &&
              styles.buttonDisabled,
            pressed &&
              !disabled &&
              styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonText}>
            {document
              ? 'Replace'
              : 'Upload'}
          </Text>
        </Pressable>
      </View>

      {document?.status ===
      'rejected' &&
      document.rejectionReason ? (
        <View style={styles.rejectionBox}>
          <Text style={styles.rejectionTitle}>
            Rejection reason
          </Text>

          <Text style={styles.rejectionText}>
            {document.rejectionReason}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

function formatFileSize(
  bytes: number,
): string {
  if (
    !Number.isFinite(bytes) ||
    bytes < 0
  ) {
    return 'Unknown size'
  }

  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(
      bytes / 1024
    ).toFixed(1)} KB`
  }

  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(1)} MB`
}

const styles = StyleSheet.create({
  container: {
    padding: UI.spacing.lg,
    borderRadius: UI.radius.lg,
    backgroundColor:
      UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },

  containerDisabled: {
    opacity: 0.6,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  icon: {
    width: 44,
    height: 44,
    borderRadius: UI.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      UI.colors.infoBackground,
    borderWidth: 1,
    borderColor: UI.colors.info,
  },

  iconText: {
    fontSize: 10,
    fontWeight: '800',
    color: UI.colors.info,
  },

  headerCopy: {
    flex: 1,
    marginLeft: UI.spacing.md,
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },

  title: {
    flexShrink: 1,
    fontSize: UI.typography.bodyLarge,
    lineHeight: 21,
    fontWeight: '800',
    color: UI.colors.text,
  },

  required: {
    marginLeft: UI.spacing.sm,
    fontSize: 10,
    fontWeight: '700',
    color: UI.colors.warning,
  },

  description: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    lineHeight: 18,
    color: UI.colors.textSecondary,
  },

  statusBadge: {
    alignSelf: 'flex-start',
    marginTop: UI.spacing.md,
    paddingHorizontal: UI.spacing.sm,
    minHeight: 26,
    borderRadius: UI.radius.pill,
    justifyContent: 'center',
    borderWidth: 1,
  },

  statusDefault: {
    backgroundColor:
      UI.colors.background,
    borderColor:
      UI.colors.border,
  },

  statusPending: {
    backgroundColor:
      UI.colors.warningBackground,
    borderColor:
      UI.colors.warning,
  },

  statusApproved: {
    backgroundColor:
      UI.colors.successBackground,
    borderColor:
      UI.colors.success,
  },

  statusRejected: {
    backgroundColor:
      UI.colors.errorBackground,
    borderColor:
      UI.colors.errorBackground,
  },

  statusText: {
    fontSize: UI.typography.small,
    fontWeight: '700',
  },

  statusTextDefault: {
    color: UI.colors.textSecondary,
  },

  statusTextPending: {
    color: UI.colors.warning,
  },

  statusTextApproved: {
    color: UI.colors.success,
  },

  statusTextRejected: {
    color: UI.colors.error,
  },

  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: UI.spacing.lg,
  },

  fileCopy: {
    flex: 1,
    marginRight: UI.spacing.md,
  },

  fileName: {
    fontSize: UI.typography.small,
    fontWeight: '600',
    color: UI.colors.text,
  },

  fileSize: {
    marginTop: 2,
    fontSize: 10,
    color: UI.colors.textMuted,
  },

  button: {
    minHeight: 40,
    paddingHorizontal: UI.spacing.md,
    borderRadius: UI.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      UI.colors.primary,
  },

  buttonDisabled: {
    opacity: 0.5,
  },

  buttonPressed: {
    opacity: 0.8,
  },

  buttonText: {
    fontSize: UI.typography.small,
    fontWeight: '700',
    color: UI.colors.surface,
  },

  rejectionBox: {
    marginTop: UI.spacing.md,
    padding: UI.spacing.md,
    borderRadius: UI.radius.md,
    backgroundColor:
      UI.colors.errorBackground,
    borderWidth: 1,
    borderColor: UI.colors.errorBackground,
  },

  rejectionTitle: {
    fontSize: UI.typography.small,
    fontWeight: '800',
    color: UI.colors.error,
  },

  rejectionText: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    lineHeight: 18,
    color: UI.colors.error,
  },
})