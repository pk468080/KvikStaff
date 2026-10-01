export type WorkerPayoutAccount = {
  id: string
  accountType: string
  accountHolderName: string
  maskedDetails: string
  status: string
  isDefault: boolean
  isVerified: boolean
}

export type WorkerPayoutRecord = {
  id: string
  amount: number
  status: string
  createdAt: string
  accountLabel: string
}

export type WorkerPayoutOverview = {
  grossEarnings: number
  platformFees: number
  netEarnings: number
  allocatedAmount: number
  pendingAmount: number
  availableAmount: number
  payoutDisabled: boolean
}
