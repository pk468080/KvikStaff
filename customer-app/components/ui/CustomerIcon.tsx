import {
  StyleSheet,
  View,
} from 'react-native'

export type CustomerIconName =
  | 'arrow-right'
  | 'chevron-left'
  | 'chevron-right'
  | 'close'
  | 'heart'
  | 'home'
  | 'list'
  | 'location'
  | 'plus'
  | 'profile'
  | 'search'

type CustomerIconProps = {
  name: CustomerIconName
  size?: number
  color?: string
  strokeWidth?: number
}

export default function CustomerIcon({
  name,
  size = 18,
  color = '#17354A',
  strokeWidth = 2,
}: CustomerIconProps) {
  const containerStyle = {
    width: size,
    height: size,
  }

  const lineStyle = {
    backgroundColor: color,
  }

  if (
    name === 'chevron-left' ||
    name === 'chevron-right'
  ) {
    return (
      <View
        style={[
          styles.container,
          containerStyle,
        ]}
        accessible={false}
        importantForAccessibility="no"
      >
        <View
          style={[
            styles.chevron,
            {
              width: size * 0.42,
              height: size * 0.42,
              borderColor: color,
              borderTopWidth: strokeWidth,
              borderRightWidth: strokeWidth,
              transform: [
                {
                  rotate:
                    name === 'chevron-right'
                      ? '45deg'
                      : '-135deg',
                },
              ],
            },
          ]}
        />
      </View>
    )
  }

  if (name === 'arrow-right') {
    return (
      <View
        style={[
          styles.container,
          containerStyle,
        ]}
        accessible={false}
        importantForAccessibility="no"
      >
        <View
          style={[
            styles.absoluteLine,
            lineStyle,
            {
              left: 1,
              right: size * 0.2,
              top: size / 2 - strokeWidth / 2,
              height: strokeWidth,
            },
          ]}
        />
        <View
          style={[
            styles.arrowHead,
            {
              width: size * 0.32,
              height: size * 0.32,
              right: 1,
              borderColor: color,
              borderTopWidth: strokeWidth,
              borderRightWidth: strokeWidth,
              transform: [{ rotate: '45deg' }],
            },
          ]}
        />
      </View>
    )
  }

  if (name === 'close') {
    return (
      <View
        style={[
          styles.container,
          containerStyle,
        ]}
        accessible={false}
        importantForAccessibility="no"
      >
        <View
          style={[
            styles.absoluteLine,
            lineStyle,
            {
              width: size * 0.75,
              height: strokeWidth,
              transform: [{ rotate: '45deg' }],
            },
          ]}
        />
        <View
          style={[
            styles.absoluteLine,
            lineStyle,
            {
              width: size * 0.75,
              height: strokeWidth,
              transform: [{ rotate: '-45deg' }],
            },
          ]}
        />
      </View>
    )
  }

  if (name === 'plus') {
    return (
      <View
        style={[
          styles.container,
          containerStyle,
        ]}
        accessible={false}
        importantForAccessibility="no"
      >
        <View
          style={[
            styles.absoluteLine,
            lineStyle,
            {
              width: size * 0.7,
              height: strokeWidth,
            },
          ]}
        />
        <View
          style={[
            styles.absoluteLine,
            lineStyle,
            {
              width: strokeWidth,
              height: size * 0.7,
            },
          ]}
        />
      </View>
    )
  }

  if (name === 'search') {
    return (
      <View
        style={[
          styles.container,
          containerStyle,
        ]}
        accessible={false}
        importantForAccessibility="no"
      >
        <View
          style={[
            styles.searchCircle,
            {
              width: size * 0.58,
              height: size * 0.58,
              borderColor: color,
              borderWidth: strokeWidth,
            },
          ]}
        />
        <View
          style={[
            styles.searchHandle,
            lineStyle,
            {
              width: size * 0.38,
              height: strokeWidth,
              right: size * 0.02,
              bottom: size * 0.2,
              transform: [{ rotate: '45deg' }],
            },
          ]}
        />
      </View>
    )
  }

  if (name === 'location') {
    return (
      <View
        style={[
          styles.container,
          containerStyle,
        ]}
        accessible={false}
        importantForAccessibility="no"
      >
        <View
          style={[
            styles.locationRing,
            {
              width: size * 0.58,
              height: size * 0.58,
              borderColor: color,
              borderWidth: strokeWidth,
              borderRadius: size * 0.29,
              top: size * 0.08,
            },
          ]}
        >
          <View
            style={[
              styles.locationDot,
              {
                width: size * 0.16,
                height: size * 0.16,
                borderRadius: size * 0.08,
                backgroundColor: color,
              },
            ]}
          />
        </View>
        <View
          style={[
            styles.locationStem,
            {
              width: strokeWidth,
              height: size * 0.28,
              backgroundColor: color,
              bottom: size * 0.03,
            },
          ]}
        />
      </View>
    )
  }

  if (name === 'home') {
    return (
      <View
        style={[
          styles.container,
          containerStyle,
        ]}
        accessible={false}
        importantForAccessibility="no"
      >
        <View
          style={[
            styles.homeRoof,
            {
              borderLeftWidth: size * 0.34,
              borderRightWidth: size * 0.34,
              borderBottomWidth: size * 0.3,
              borderBottomColor: color,
            },
          ]}
        />
        <View
          style={[
            styles.homeBody,
            {
              width: size * 0.58,
              height: size * 0.4,
              backgroundColor: color,
              bottom: size * 0.08,
            },
          ]}
        />
      </View>
    )
  }

  if (name === 'list') {
    return (
      <View
        style={[
          styles.container,
          containerStyle,
        ]}
        accessible={false}
        importantForAccessibility="no"
      >
        {[0, 1, 2].map(index => (
          <View
            key={index}
            style={[
              styles.listLine,
              lineStyle,
              {
                width: size * 0.7,
                height: strokeWidth,
                top: size * (0.2 + index * 0.3),
              },
            ]}
          />
        ))}
      </View>
    )
  }

  if (name === 'profile') {
    return (
      <View
        style={[
          styles.container,
          containerStyle,
        ]}
        accessible={false}
        importantForAccessibility="no"
      >
        <View
          style={[
            styles.profileHead,
            {
              width: size * 0.28,
              height: size * 0.28,
              borderRadius: size * 0.14,
              backgroundColor: color,
              top: size * 0.12,
            },
          ]}
        />
        <View
          style={[
            styles.profileBody,
            {
              width: size * 0.62,
              height: size * 0.3,
              borderRadius: size * 0.3,
              backgroundColor: color,
              bottom: size * 0.1,
            },
          ]}
        />
      </View>
    )
  }

  return (
    <View
      style={[
        styles.container,
        containerStyle,
      ]}
      accessible={false}
      importantForAccessibility="no"
    >
      <View
        style={[
          styles.heartPart,
          {
            width: size * 0.48,
            height: size * 0.48,
            left: size * 0.12,
            top: size * 0.12,
            backgroundColor: color,
            transform: [{ rotate: '45deg' }],
          },
        ]}
      />
      <View
        style={[
          styles.heartLobe,
          {
            width: size * 0.46,
            height: size * 0.46,
            left: size * 0.08,
            top: size * 0.04,
            borderRadius: size * 0.23,
            backgroundColor: color,
          },
        ]}
      />
      <View
        style={[
          styles.heartLobe,
          {
            width: size * 0.46,
            height: size * 0.46,
            right: size * 0.08,
            top: size * 0.04,
            borderRadius: size * 0.23,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  absoluteLine: {
    position: 'absolute',
  },
  chevron: {
    position: 'absolute',
  },
  arrowHead: {
    position: 'absolute',
  },
  searchCircle: {
    position: 'absolute',
    borderRadius: 99,
  },
  searchHandle: {
    position: 'absolute',
  },
  locationRing: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
  locationDot: {},
  locationStem: {
    position: 'absolute',
    transform: [{ rotate: '45deg' }],
  },
  homeRoof: {
    position: 'absolute',
    left: '16%',
    top: '12%',
    width: 0,
    height: 0,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  homeBody: {
    position: 'absolute',
  },
  listLine: {
    position: 'absolute',
    left: '15%',
  },
  profileHead: {
    position: 'absolute',
  },
  profileBody: {
    position: 'absolute',
  },
  heartPart: {
    position: 'absolute',
  },
  heartLobe: {
    position: 'absolute',
  },
})
