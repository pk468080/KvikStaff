import {
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

import type { BookingType } from '../../types/booking'
import { styles } from './bookingStyles'

const METHOD_COPY: Record<
  BookingType,
  {
    eyebrow: string
    title: string
    description: string
  }
> = {
  instant: {
    eyebrow: 'FASTEST',
    title: 'Instant',
    description:
      'Start today with the next available time.',
  },

  scheduled: {
    eyebrow: 'FLEXIBLE',
    title: 'Scheduled',
    description:
      'Choose a future date and time.',
  },

  recurring: {
    eyebrow: 'REPEAT',
    title: 'Recurring',
    description:
      'Book the same service on selected days.',
  },
}

type Props = {
  bookingType: BookingType
  hasInstantAvailability: boolean
  onSelect: (type: BookingType) => void
}

export default function BookingMethodSelector({
  bookingType,
  hasInstantAvailability,
  onSelect,
}: Props) {
  const types: BookingType[] = [
    'instant',
    'scheduled',
    'recurring',
  ]

  return (
    <View style={styles.methodList}>
      {types.map(type => {
        const selected =
          type === bookingType

        const instantDisabled =
          type === 'instant' &&
          !hasInstantAvailability

        return (
          <TouchableOpacity
            key={type}
            activeOpacity={0.86}
            accessibilityRole="button"
            accessibilityState={{
              selected,
              disabled: instantDisabled,
            }}
            disabled={instantDisabled}
            onPress={() => onSelect(type)}
            style={[
              styles.methodCard,
              selected &&
                styles.methodCardSelected,
              instantDisabled &&
                styles.methodCardDisabled,
            ]}
          >
            <View
              style={[
                styles.methodIcon,
                selected &&
                  styles.methodIconSelected,
              ]}
            >
              <Text
                style={[
                  styles.methodIconText,
                  selected &&
                    styles.methodIconTextSelected,
                ]}
              >
                {type === 'instant'
                  ? 'I'
                  : type === 'scheduled'
                    ? 'S'
                    : 'R'}
              </Text>
            </View>

            <View
              style={styles.methodContent}
            >
              <View
                style={styles.methodTitleRow}
              >
                <View>
                  <Text
                    style={[
                      styles.methodEyebrow,
                      selected &&
                        styles.methodEyebrowSelected,
                    ]}
                  >
                    {METHOD_COPY[type].eyebrow}
                  </Text>

                  <Text
                    style={styles.methodTitle}
                  >
                    {METHOD_COPY[type].title}
                  </Text>
                </View>

                {type === 'instant' &&
                  (hasInstantAvailability ? (
                    <View
                      style={
                        styles.availableBadge
                      }
                    >
                      <Text
                        style={
                          styles.availableBadgeText
                        }
                      >
                        Available
                      </Text>
                    </View>
                  ) : (
                    <View
                      style={
                        styles.unavailableBadge
                      }
                    >
                      <Text
                        style={
                          styles.unavailableBadgeText
                        }
                      >
                        Unavailable
                      </Text>
                    </View>
                  ))}
              </View>

              <Text
                style={
                  styles.methodDescription
                }
              >
                {METHOD_COPY[type].description}
              </Text>
            </View>

            <View
              style={[
                styles.radioOuter,
                selected &&
                  styles.radioOuterSelected,
              ]}
            >
              {selected && (
                <View
                  style={styles.radioInner}
                />
              )}
            </View>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}