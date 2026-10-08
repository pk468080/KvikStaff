export const UI = {
  splashDuration: 2000,

  colors: {
    primary: '#0A3972', // Primary navy
    primaryBlue: '#0784FB',
    secondary: '#0784FB', // Fallback for components still using secondary
    accent: '#78E2E0', // Teal accent

    background: '#F5FAFD', // very light blue-white
    surface: '#FFFFFF',

    text: '#0A3972',
    textSecondary: '#61798A',
    textMuted: '#98A2B3',

    border: '#DCEAF2',
    inputBorder: '#DCEAF2',

    success: '#16A34A', // clean green
    successBackground: '#DCFCE7',

    warning: '#D97706', // clean amber
    warningBackground: '#FEF3C7',

    error: '#DC2626', // clean red
    errorBackground: '#FEE2E2',

    info: '#0784FB',
    infoBackground: '#EFF6FF',

    disabled: '#98A2B3',
    disabledBackground: '#F3F4F6',

    // Tab bar specific
    tabBarActive: '#0784FB',
    tabBarInactive: '#61798A',
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },

  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    pill: 999,
  },

  typography: {
    caption: 11,
    small: 12,
    body: 14,
    bodyLarge: 16,
    subtitle: 18,
    title: 24,
    largeTitle: 28,
  },

  shadows: {
    sm: {
      shadowColor: '#0A3972',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 2,
    },
    md: {
      shadowColor: '#0A3972',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 4,
    },
    lg: {
      shadowColor: '#0A3972',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 8,
    },
  },

  sizes: {
    buttonHeight: 52,
    inputHeight: 52,
    headerHeight: 56,
    tabBarHeight: 64,
  },
} as const;
