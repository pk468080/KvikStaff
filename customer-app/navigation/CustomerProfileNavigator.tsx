import {
  createNativeStackNavigator,
} from '@react-navigation/native-stack'

import MyProfileScreen from '../screens/profile/MyProfileScreen'
import EditProfileScreen from '../screens/profile/EditProfileScreen'
import SavedAddressesScreen from '../screens/profile/SavedAddressesScreen'
import NotificationsScreen from '../screens/profile/NotificationsScreen'
import SupportScreen from '../screens/profile/SupportScreen'
import SupportRequestsScreen from '../screens/profile/SupportRequestsScreen'
import DeleteAccountScreen from '../screens/profile/DeleteAccountScreen'
import LegalDocumentScreen from '../screens/profile/LegalDocumentScreen'

export type CustomerProfileStackParamList = {
  ProfileHome: undefined
  EditProfile: undefined
  SavedAddresses: undefined
  Notifications: undefined
  Support: undefined
  SupportRequests: undefined
  DeleteAccount: undefined
  Terms: undefined
  Privacy: undefined
}

const Stack =
  createNativeStackNavigator<CustomerProfileStackParamList>()

type CustomerProfileNavigatorProps = {
  onOpenBooking: (
    bookingId: string,
  ) => void
  onSignOut: () => void
}

export default function CustomerProfileNavigator({
  onOpenBooking,
  onSignOut,
}: CustomerProfileNavigatorProps) {
  return (
    <Stack.Navigator
      initialRouteName="ProfileHome"
      screenOptions={{
        headerShown: true,
        headerBackTitle: 'Back',
        headerTintColor: '#111827',
        headerTitleStyle: {
          fontSize: 17,
          fontWeight: '700',
        },
        contentStyle: {
          backgroundColor: '#F7F9FC',
        },
      }}
    >
      <Stack.Screen
        name="ProfileHome"
        options={{
          headerShown: false,
        }}
      >
        {({ navigation }) => (
          <MyProfileScreen
            onSignOut={onSignOut}
            onEditProfile={() =>
              navigation.navigate(
                'EditProfile',
              )
            }
            onSavedAddresses={() =>
              navigation.navigate(
                'SavedAddresses',
              )
            }
            onNotifications={() =>
              navigation.navigate(
                'Notifications',
              )
            }
            onSupport={() =>
              navigation.navigate(
                'Support',
              )
            }
            onDeleteAccount={() =>
              navigation.navigate(
                'DeleteAccount',
              )
            }
            onTerms={() =>
              navigation.navigate(
                'Terms',
              )
            }
            onPrivacy={() =>
              navigation.navigate(
                'Privacy',
              )
            }
          />
        )}
      </Stack.Screen>

      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{
          title: 'Edit Profile',
        }}
      />

      <Stack.Screen
        name="SavedAddresses"
        component={SavedAddressesScreen}
        options={{
          title: 'Saved Addresses',
        }}
      />

      <Stack.Screen
        name="Notifications"
        options={{
          title: 'Notifications',
        }}
      >
        {() => (
          <NotificationsScreen
            onOpenBooking={
              onOpenBooking
            }
          />
        )}
      </Stack.Screen>

      <Stack.Screen
        name="Support"
        options={{
          title: 'Help & Support',
        }}
      >
        {({ navigation }) => (
          <SupportScreen
            onViewRequests={() =>
              navigation.navigate(
                'SupportRequests',
              )
            }
          />
        )}
      </Stack.Screen>

      <Stack.Screen
        name="SupportRequests"
        component={
          SupportRequestsScreen
        }
        options={{
          title: 'My Support Requests',
        }}
      />

      <Stack.Screen
        name="DeleteAccount"
        component={
          DeleteAccountScreen
        }
        options={{
          title: 'Delete Account',
        }}
      />

      <Stack.Screen
        name="Terms"
        options={{
          title:
            'Terms & Conditions',
        }}
      >
        {() => (
          <LegalDocumentScreen
            title="Terms & Conditions"
            documentType="terms"
          />
        )}
      </Stack.Screen>

      <Stack.Screen
        name="Privacy"
        options={{
          title: 'Privacy Policy',
        }}
      >
        {() => (
          <LegalDocumentScreen
            title="Privacy Policy"
            documentType="privacy"
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  )
}
