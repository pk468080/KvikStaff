// worker-app/types/navigation.ts

export type RootStackParamList = {
  Splash: undefined
  Login: undefined
  WorkerRegistration: undefined
  WorkerOnboarding: undefined
  Worker: undefined
}

export type WorkerTabParamList = {
  Home: undefined
  Bookings: undefined
  Earnings: undefined
  Profile: undefined
}

export type WorkerStackParamList = {
  Tabs: undefined

  BookingOffer: {
    bookingId: string
  }

  ActiveBooking: {
    bookingId: string
  }

  BookingDetails: {
    bookingId: string
  }

  BookingOccurrence: {
    occurrenceId: string
  }

  Schedule: undefined

  Notifications: undefined

  Support: undefined

  EditProfile: undefined

  Settings: undefined

  EarningDetails: {
    earningId: string
  }
}
