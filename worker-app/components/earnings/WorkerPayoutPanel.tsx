import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { AppButton } from '../ui/AppButton'
import { UI } from '../../constants/ui'
import type { WorkerPayoutAccount, WorkerPayoutOverview, WorkerPayoutRecord } from '../../types/payouts'
import {
  createWorkerPayoutAccount,
  disableWorkerPayoutAccount,
  getWorkerAvailableEarnings,
  getWorkerPayoutOverview,
  listWorkerPayoutAccounts,
  listWorkerPayouts,
  requestWorkerPayout,
  setWorkerDefaultPayoutAccount,
} from '../../services/earnings/workerPayouts.service'

type Props = { formatAmount: (value: number) => string }
type AccountMode = 'bank' | 'upi'

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function WorkerPayoutPanel({ formatAmount }: Props) {
  const [overview, setOverview] = useState<WorkerPayoutOverview | null>(null)
  const [availableAmount, setAvailableAmount] = useState(0)
  const [accounts, setAccounts] = useState<WorkerPayoutAccount[]>([])
  const [payouts, setPayouts] = useState<WorkerPayoutRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [accountMode, setAccountMode] = useState<AccountMode>('bank')
  const [accountModal, setAccountModal] = useState(false)
  const [holderName, setHolderName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [ifsc, setIfsc] = useState('')
  const [upiId, setUpiId] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextOverview, nextAvailable, nextAccounts, nextPayouts] = await Promise.all([
        getWorkerPayoutOverview(),
        getWorkerAvailableEarnings(),
        listWorkerPayoutAccounts(),
        listWorkerPayouts(),
      ])
      setOverview(nextOverview)
      setAvailableAmount(nextAvailable)
      setAccounts(nextAccounts)
      setPayouts(nextPayouts)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load payout information.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  async function run(action: () => Promise<unknown>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await action()
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update payout information.')
    } finally {
      setBusy(false)
    }
  }

  const defaultAccount = accounts.find(account => account.isDefault && account.isVerified)
  const payoutDisabled = overview?.payoutDisabled === true
  const payoutAmount = Math.max(0, availableAmount || overview?.availableAmount || 0)

  async function submitAccount(): Promise<void> {
    const body: Record<string, string> = {
      account_type: accountMode,
      account_holder_name: holderName.trim(),
    }
    if (accountMode === 'bank') {
      body.account_number = accountNumber.trim()
      body.ifsc_code = ifsc.trim()
    } else {
      body.upi_id = upiId.trim()
    }
    await run(async () => { await createWorkerPayoutAccount(body) })
    setAccountModal(false)
    setHolderName('')
    setAccountNumber('')
    setIfsc('')
    setUpiId('')
  }

  if (loading && !overview) {
    return <View style={styles.section}><ActivityIndicator color={UI.colors.secondary} /></View>
  }

  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>PAYOUTS</Text>
      <Text style={styles.title}>Payout overview</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {overview ? (
        <View style={styles.card}>
          <View style={styles.grid}>
            <Metric label="Gross" value={formatAmount(overview.grossEarnings)} />
            <Metric label="Platform fees" value={formatAmount(overview.platformFees)} />
            <Metric label="Net" value={formatAmount(overview.netEarnings)} />
            <Metric label="Allocated / pending" value={formatAmount(overview.allocatedAmount + overview.pendingAmount)} />
            <Metric label="Available" value={formatAmount(payoutAmount)} />
          </View>
          {payoutDisabled ? <Text style={styles.notice}>Payout processing is currently disabled. Your earnings remain recorded, but payout requests cannot be processed yet.</Text> : null}
        </View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.rowHeader}><Text style={styles.cardTitle}>Payout accounts</Text><AppButton title="Add account" variant="secondary" onPress={() => setAccountModal(true)} /></View>
        {accounts.length === 0 ? <Text style={styles.muted}>No payout accounts added.</Text> : accounts.map(account => (
          <View key={account.id} style={styles.accountRow}>
            <View style={styles.accountCopy}><Text style={styles.accountTitle}>{account.accountType} {account.isDefault ? '• Default' : ''}</Text><Text style={styles.muted}>{account.accountHolderName} {account.maskedDetails}</Text><Text style={styles.muted}>{account.status}{account.isVerified ? ' • Verified' : ''}</Text></View>
            <View style={styles.accountActions}>{account.isVerified && !account.isDefault ? <Pressable disabled={busy} onPress={() => void run(() => setWorkerDefaultPayoutAccount(account.id))}><Text style={styles.link}>Set default</Text></Pressable> : null}<Pressable disabled={busy} onPress={() => void run(() => disableWorkerPayoutAccount(account.id))}><Text style={styles.dangerLink}>Disable</Text></Pressable></View>
          </View>
        ))}
        <AppButton title={payoutDisabled ? 'Payouts disabled' : 'Request available payout'} disabled={busy || payoutDisabled || !defaultAccount || payoutAmount <= 0} onPress={() => void run(() => requestWorkerPayout(payoutAmount, defaultAccount!.id))} />
        {!defaultAccount && !payoutDisabled ? <Text style={styles.muted}>Add and verify a default payout account before requesting a payout.</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Payout history</Text>
        {payouts.length === 0 ? <Text style={styles.muted}>No payout requests yet.</Text> : payouts.map(payout => <View key={payout.id} style={styles.historyRow}><Text style={styles.muted}>{formatDate(payout.createdAt)}{payout.accountLabel ? ` • ${payout.accountLabel}` : ''}</Text><Text style={styles.historyAmount}>{formatAmount(payout.amount)} • {payout.status}</Text></View>)}
      </View>

      <Modal visible={accountModal} animationType="slide" transparent onRequestClose={() => setAccountModal(false)}>
        <View style={styles.backdrop}><View style={styles.modal}><ScrollView contentContainerStyle={styles.modalContent}><View style={styles.rowHeader}><Text style={styles.cardTitle}>Add payout account</Text><Pressable onPress={() => setAccountModal(false)}><Ionicons name="close" size={24} color={UI.colors.textMuted} /></Pressable></View><View style={styles.actionRow}><AppButton title="Bank" variant={accountMode === 'bank' ? 'primary' : 'secondary'} onPress={() => setAccountMode('bank')} /><AppButton title="UPI" variant={accountMode === 'upi' ? 'primary' : 'secondary'} onPress={() => setAccountMode('upi')} /></View><Field label="Account holder name" value={holderName} onChangeText={setHolderName} /><Field label={accountMode === 'bank' ? 'Account number' : 'UPI ID'} value={accountMode === 'bank' ? accountNumber : upiId} onChangeText={accountMode === 'bank' ? setAccountNumber : setUpiId} /><>{accountMode === 'bank' ? <Field label="IFSC code" value={ifsc} onChangeText={setIfsc} /> : null}</><AppButton title={busy ? 'Saving...' : 'Save account'} disabled={busy} onPress={() => void submitAccount()} /></ScrollView></View></View>
      </Modal>
    </View>
  )
}

function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><Text style={styles.muted}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View> }
function Field({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) { return <View><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChangeText} autoCapitalize="none" style={styles.input} /></View> }

const styles = StyleSheet.create({
  section: { marginTop: UI.spacing.lg }, eyebrow: { color: UI.colors.secondary, fontSize: UI.typography.caption, fontWeight: '800', letterSpacing: 1 }, title: { marginTop: UI.spacing.sm, color: UI.colors.text, fontSize: UI.typography.subtitle, fontWeight: '800' }, card: { marginTop: UI.spacing.md, padding: UI.spacing.lg, borderRadius: UI.radius.lg, backgroundColor: UI.colors.surface, gap: UI.spacing.md }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: UI.spacing.md }, metric: { minWidth: '44%' }, metricValue: { marginTop: 3, color: UI.colors.text, fontSize: UI.typography.bodyLarge, fontWeight: '800' }, cardTitle: { color: UI.colors.text, fontSize: UI.typography.bodyLarge, fontWeight: '800' }, rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: UI.spacing.sm }, accountRow: { flexDirection: 'row', justifyContent: 'space-between', gap: UI.spacing.md, paddingVertical: UI.spacing.sm, borderTopWidth: 1, borderTopColor: UI.colors.border }, accountCopy: { flex: 1 }, accountTitle: { color: UI.colors.text, fontWeight: '800', textTransform: 'capitalize' }, accountActions: { gap: UI.spacing.sm, alignItems: 'flex-end' }, link: { color: UI.colors.secondary, fontWeight: '800' }, dangerLink: { color: UI.colors.error, fontWeight: '700' }, muted: { color: UI.colors.textSecondary, lineHeight: 19 }, notice: { padding: UI.spacing.md, borderRadius: UI.radius.md, color: UI.colors.warning, backgroundColor: UI.colors.warningBackground, lineHeight: 19 }, error: { marginTop: UI.spacing.sm, color: UI.colors.error }, historyRow: { paddingVertical: UI.spacing.sm, borderTopWidth: 1, borderTopColor: UI.colors.border }, historyAmount: { marginTop: 3, color: UI.colors.text, fontWeight: '800' }, backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }, modal: { maxHeight: '85%', backgroundColor: UI.colors.surface, borderTopLeftRadius: UI.radius.lg, borderTopRightRadius: UI.radius.lg }, modalContent: { padding: UI.spacing.lg, gap: UI.spacing.md }, actionRow: { flexDirection: 'row', gap: UI.spacing.sm }, fieldLabel: { color: UI.colors.text, fontWeight: '800' }, input: { minHeight: 48, paddingHorizontal: UI.spacing.md, borderWidth: 1, borderColor: UI.colors.inputBorder, borderRadius: UI.radius.md, color: UI.colors.text, backgroundColor: UI.colors.background },
})
