import type { ReactNode } from 'react'
import {
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native'

import { ScreenContainer } from '../../components/layout/ScreenContainer'

type DocumentType =
  | 'terms'
  | 'privacy'

export default function LegalDocumentScreen({
  title,
  documentType,
}: {
  title: string
  documentType: DocumentType
}) {
  return (
    <ScreenContainer
      style={styles.screen}
    >
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <Text
          style={styles.title}
        >
          {title}
        </Text>

        <Text
          style={styles.meta}
        >
          KvikStaff Customer App
        </Text>

        <Section title="Important">
          <Text
            style={styles.paragraph}
          >
            {documentType === 'terms'
              ? 'This page is the in-app location for the final KvikStaff Terms & Conditions. Replace the draft text below with the final terms approved for your business before launch.'
              : 'This page is the in-app location for the final KvikStaff Privacy Policy. Replace the draft text below with the final policy approved for your business before launch.'}
          </Text>
        </Section>

        <Section title="1. Purpose">
          <Text
            style={styles.paragraph}
          >
            {documentType === 'terms'
              ? 'KvikStaff connects customers with temporary staffing services for eligible bookings. The final terms should define booking obligations, payment terms, cancellations, service expectations and liability.'
              : 'The final privacy policy should explain what personal information KvikStaff collects, why it is collected, how it is used, how it is shared, retention periods, security practices and customer rights.'}
          </Text>
        </Section>

        <Section title="2. Final legal copy">
          <Text
            style={styles.placeholder}
          >
            Insert your finalized legal document here before production release.
          </Text>
        </Section>
      </ScrollView>
    </ScreenContainer>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <>
      <Text
        style={styles.sectionTitle}
      >
        {title}
      </Text>
      {children}
    </>
  )
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#F7F9FC',
  },

  content: {
    padding: 18,
    paddingBottom: 36,
  },

  title: {
    color: '#111827',
    fontSize: 25,
    fontWeight: '800',
  },

  meta: {
    color: '#9AA1AD',
    fontSize: 11,
    marginTop: 5,
    marginBottom: 22,
  },

  sectionTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 16,
    marginBottom: 7,
  },

  paragraph: {
    color: '#697281',
    fontSize: 13,
    lineHeight: 21,
  },

  placeholder: {
    color: '#7A271A',
    backgroundColor: '#FFF8F7',
    borderWidth: 1,
    borderColor: '#FFD7D2',
    borderRadius: 14,
    padding: 14,
    fontSize: 13,
    lineHeight: 20,
  },
})
