import { StyleSheet } from 'react-native'
import { UI } from '../../constants/ui';

export const styles = StyleSheet.create({
  pageContent: {
    paddingHorizontal: UI.spacing.xl,
    paddingTop: 14,
    paddingBottom: 40,
  },

  header: {
    marginBottom: UI.spacing.lg,
  },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: UI.spacing.md,
  },

  brandLogo: {
    width: 92,
    height: 28,
  },

  brandDivider: {
    width: 1,
    height: 18,
    marginHorizontal: 10,
    backgroundColor: '#D8E8ED',
  },

  brandCaption: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#5E7C8B',
  },

  title: {
    fontSize: UI.typography.title,
    lineHeight: 30,
    fontWeight: '800',
    color: UI.colors.primary,
  },

  subtitle: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 19,
    color: '#5E7C8B',
  },

  serviceHero: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: UI.spacing.lg,
    marginBottom: UI.spacing.md,
    borderRadius: 18,
    backgroundColor: UI.colors.primary,
  },

  serviceHeroImageWrap: {
    width: 62,
    height: 62,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: UI.colors.surface,
    marginRight: 14,
  },

  serviceHeroImage: {
    width: '100%',
    height: '100%',
  },

  serviceHeroFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF7F7',
  },

  serviceHeroFallbackText: {
    fontSize: 22,
    fontWeight: '800',
    color: UI.colors.primary,
  },

  serviceHeroContent: {
    flex: 1,
    minWidth: 0,
  },

  serviceHeroName: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
    color: UI.colors.surface,
  },

  serviceHeroPrice: {
    marginTop: UI.spacing.xs,
    fontSize: 15,
    fontWeight: '700',
    color: UI.colors.surface,
  },

  serviceHeroPriceSuffix: {
    fontWeight: '500',
    opacity: 0.72,
  },

  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginBottom: 14,
    borderRadius: UI.radius.lg,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: '#E5F2F5',
  },

  locationIcon: {
    width: 38,
    height: 38,
    borderRadius: UI.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5F2F5',
    marginRight: 12,
  },

  locationIconText: {
    fontSize: 26,
    lineHeight: 26,
    color: '#174C68',
    fontWeight: '800',
  },

  locationContent: {
    flex: 1,
    minWidth: 0,
  },

  locationLabel: {
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '800',
    letterSpacing: 0.9,
    color: '#5E7C8B',
  },

  locationAddress: {
    marginTop: 2,
    fontSize: UI.typography.body,
    lineHeight: 19,
    fontWeight: '600',
    color: UI.colors.primary,
  },

  availabilityShell: {
    marginBottom: UI.spacing.md,
  },

  availabilityDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    backgroundColor: '#F0FBF8',
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#BFE9DF',
  },

  availabilityStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: UI.colors.success,
    marginRight: 8,
  },

  availabilityDetailsText: {
    fontSize: UI.typography.small,
    fontWeight: '700',
    color: '#087F72',
  },

  sectionDescription: {
    marginTop: -3,
    marginBottom: UI.spacing.md,
    fontSize: 13,
    lineHeight: 19,
    color: '#5E7C8B',
  },

  methodList: {
    gap: 10,
  },

  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 94,
    padding: 14,
    borderRadius: 18,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: '#E5F2F5',
  },

  methodCardSelected: {
    borderColor: UI.colors.primary,
    borderWidth: 2,
  },

  methodCardDisabled: {
    opacity: 0.55,
  },

  methodIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF7F7',
    marginRight: 12,
  },

  methodIconSelected: {
    backgroundColor: UI.colors.primaryBlue,
  },

  methodIconText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#37657A',
  },

  methodIconTextSelected: {
    color: UI.colors.surface,
  },

  methodContent: {
    flex: 1,
    minWidth: 0,
  },

  methodTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  methodEyebrow: {
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.8,
    fontWeight: '800',
    color: '#94A3B8',
  },

  methodEyebrowSelected: {
    color: '#37657A',
  },

  methodTitle: {
    marginTop: 1,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
    color: UI.colors.primary,
  },

  methodDescription: {
    marginTop: UI.spacing.xs,
    paddingRight: 4,
    fontSize: UI.typography.small,
    lineHeight: 17,
    color: '#5E7C8B',
  },

  availableBadge: {
    paddingHorizontal: UI.spacing.sm,
    paddingVertical: UI.spacing.xs,
    borderRadius: UI.radius.pill,
    backgroundColor: '#DDF7F0',
  },

  availableBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#087F72',
  },

  unavailableBadge: {
    paddingHorizontal: UI.spacing.sm,
    paddingVertical: UI.spacing.xs,
    borderRadius: UI.radius.pill,
    backgroundColor: '#F1F5F9',
  },

  unavailableBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
  },

  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: UI.radius.md,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },

  radioOuterSelected: {
    borderColor: UI.colors.primary,
  },

  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: UI.colors.primaryBlue,
  },

  bottomTrustCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: UI.spacing.md,
    padding: 14,
    marginTop: 2,
    borderRadius: UI.radius.lg,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: '#E5F2F5',
  },

  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  trustDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: UI.colors.success,
    marginRight: 6,
  },

  trustText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#5E7C8B',
  },

  flowModal: {
    flex: 1,
    backgroundColor: '#F8FBFC',
  },

  flowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: UI.spacing.lg,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: UI.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: '#E5F2F5',
  },

  headerAction: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerActionText: {
    fontSize: 32,
    lineHeight: 36,
    color: UI.colors.primary,
    fontWeight: '400',
  },

  headerCloseText: {
    fontSize: UI.typography.largeTitle,
    lineHeight: 32,
    color: UI.colors.primary,
    fontWeight: '400',
  },

  flowHeaderCenter: {
    flex: 1,
    alignItems: 'center',
  },

  flowTitle: {
    fontSize: UI.typography.bodyLarge,
    lineHeight: 21,
    fontWeight: '800',
    color: UI.colors.primary,
  },

  flowStepLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
  },

  progressTrack: {
    height: 4,
    backgroundColor: '#E5E7EB',
  },

  progressFill: {
    height: '100%',
    backgroundColor: UI.colors.primaryBlue,
    borderRadius: 2,
  },

 flowContent: {
  flexGrow: 1,
  paddingHorizontal: UI.spacing.xl,
  paddingTop: 20,
  paddingBottom: 18,
},
  flowEyebrow: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: '#5E7C8B',
  },

  flowStepTitle: {
  marginTop: UI.spacing.xs,
  fontSize: 22,
  lineHeight: 27,
  fontWeight: '800',
  color: UI.colors.primary,
},

  flowServiceName: {
  marginTop: 2,
  fontSize: 13,
  lineHeight: 18,
  fontWeight: '600',
  color: '#5E7C8B',
},

  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    padding: 13,
    borderRadius: 14,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: '#E5F2F5',
  },

  infoBannerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5F2F5',
    marginRight: 10,
  },

  infoBannerIconText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#174C68',
  },

  infoBannerText: {
    flex: 1,
    fontSize: UI.typography.small,
    lineHeight: 17,
    color: '#37657A',
  },

  emptySlotsCard: {
    marginTop: 18,
    padding: 18,
    borderRadius: UI.radius.lg,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: '#E5F2F5',
    alignItems: 'center',
  },

  emptySlotsTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: UI.colors.primary,
    textAlign: 'center',
  },

  emptySlotsText: {
    marginTop: 6,
    fontSize: UI.typography.small,
    lineHeight: 18,
    color: '#5E7C8B',
    textAlign: 'center',
  },

  slotDisclaimer: {
    marginTop: UI.spacing.md,
    fontSize: UI.typography.caption,
    lineHeight: 16,
    color: '#94A3B8',
  },

  slotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 54,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: '#E5F2F5',
  },

  slotCardSelected: {
    borderColor: '#1D6CF2',
    borderWidth: 2,
    backgroundColor: '#F4F8FF',
  },

  slotTime: {
    fontSize: 15,
    fontWeight: '700',
    color: '#174C68',
  },

  slotTimeSelected: {
    color: UI.colors.primary,
  },

  slotCheck: {
    width: 24,
    height: 24,
    borderRadius: UI.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#CBD5E1',
  },

  slotCheckSelected: {
    borderColor: '#1D6CF2',
    backgroundColor: '#1D6CF2',
  },

  slotCheckText: {
    fontSize: UI.typography.small,
    lineHeight: 14,
    fontWeight: '900',
    color: UI.colors.surface,
  },

  stepDescription: {
  marginTop: UI.spacing.md,
  marginBottom: 14,
  fontSize: 12.5,
  lineHeight: 18,
  color: '#5E7C8B',
},

  selectionCard: {
  flexDirection: 'row',
  alignItems: 'center',
  minHeight: 88,
  marginTop: UI.spacing.xs,
  paddingHorizontal: 14,
  paddingVertical: 13,
  borderRadius: UI.radius.lg,
  backgroundColor: UI.colors.surface,
  borderWidth: 1,
  borderColor: '#E5F2F5',
},

  selectionIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF7F7',
    marginRight: 12,
  },

  selectionIconText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#174C68',
  },

  selectionContent: {
    flex: 1,
  },

  selectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#94A3B8',
  },

  selectionValue: {
  marginTop: 2,
  fontSize: 17,
  lineHeight: 22,
  fontWeight: '800',
  color: UI.colors.primary,
},

  selectionHint: {
    marginTop: 2,
    fontSize: UI.typography.caption,
    color: '#5E7C8B',
  },

  chevron: {
    marginLeft: 8,
    fontSize: UI.typography.largeTitle,
    color: '#94A3B8',
  },

  contextCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    padding: 14,
    borderRadius: UI.radius.lg,
    backgroundColor: '#F1F7F9',
  },

  contextIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.colors.surface,
    marginRight: 12,
  },

  contextIconText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#174C68',
  },

  contextContent: {
    flex: 1,
  },

  contextLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    color: '#94A3B8',
  },

  contextValue: {
    marginTop: 3,
    fontSize: 17,
    fontWeight: '800',
    color: UI.colors.primary,
  },

  contextHint: {
    marginTop: 2,
    fontSize: UI.typography.caption,
    color: '#5E7C8B',
  },

  subheading: {
    marginTop: UI.spacing.xl,
    marginBottom: 10,
    fontSize: UI.typography.bodyLarge,
    fontWeight: '800',
    color: UI.colors.primary,
  },

  durationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  durationOption: {
    width: '48%',
    minHeight: 58,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: '#E5F2F5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  durationOptionSelected: {
    borderColor: '#1D6CF2',
    borderWidth: 2,
    backgroundColor: '#F4F8FF',
  },

  durationOptionText: {
    fontSize: UI.typography.body,
    fontWeight: '700',
    color: '#174C68',
  },

  durationOptionTextSelected: {
    color: UI.colors.primary,
  },

  checkCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1D6CF2',
  },

  checkCircleText: {
    fontSize: UI.typography.caption,
    fontWeight: '900',
    color: UI.colors.surface,
  },

  endTimeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    padding: 14,
    borderRadius: UI.radius.lg,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: '#E5F2F5',
  },

  warningCard: {
    marginTop: 14,
    padding: 13,
    borderRadius: 14,
    backgroundColor: '#FFF4E8',
    borderWidth: 1,
    borderColor: '#FFD8B0',
  },

  warningTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#A75A16',
  },

  warningText: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    lineHeight: 17,
    color: '#B86A20',
  },

  previewCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: UI.radius.lg,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: '#E5F2F5',
  },

  previewTitle: {
    fontSize: UI.typography.body,
    fontWeight: '800',
    color: UI.colors.primary,
    marginBottom: UI.spacing.sm,
  },

  summaryCard: {
    marginTop: 18,
    padding: 15,
    borderRadius: 18,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: '#E5F2F5',
  },

  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  summaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF7F7',
    marginRight: 11,
  },

  summaryIconText: {
    fontSize: UI.typography.caption,
    fontWeight: '900',
    color: '#174C68',
  },

  summaryMain: {
    flex: 1,
    minWidth: 0,
  },

  summaryLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
  },

  summaryValue: {
    marginTop: 3,
    fontSize: UI.typography.body,
    lineHeight: 19,
    fontWeight: '700',
    color: UI.colors.primary,
  },

  summaryDivider: {
    height: 1,
    marginVertical: 12,
    backgroundColor: '#E5F2F5',
  },

  liveCheckBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    padding: 13,
    borderRadius: 14,
    backgroundColor: '#EEF7FF',
    borderWidth: 1,
    borderColor: '#D4E7FF',
  },

  liveCheckIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1D6CF2',
    marginRight: 10,
  },

  liveCheckIconText: {
    fontSize: 13,
    fontWeight: '900',
    color: UI.colors.surface,
  },

  liveCheckContent: {
    flex: 1,
  },

  liveCheckTitle: {
    fontSize: UI.typography.small,
    fontWeight: '800',
    color: UI.colors.primary,
  },

  liveCheckText: {
    marginTop: 3,
    fontSize: UI.typography.caption,
    lineHeight: 16,
    color: '#4D6680',
  },

  waitingPriceCard: {
    marginTop: 14,
    padding: UI.spacing.lg,
    borderRadius: UI.radius.lg,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: '#E5F2F5',
  },

  waitingPriceTitle: {
    fontSize: UI.typography.body,
    fontWeight: '800',
    color: UI.colors.primary,
  },

  waitingPriceText: {
    marginTop: UI.spacing.xs,
    fontSize: UI.typography.small,
    lineHeight: 18,
    color: '#5E7C8B',
  },

  pickerModal: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },

  pickerSheet: {
    backgroundColor: UI.colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingBottom: 28,
  },

  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: UI.spacing.lg,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },

  pickerHeaderButton: {
    fontSize: UI.typography.body,
    fontWeight: '600',
    color: '#64748B',
  },

  pickerHeaderTitle: {
    fontSize: UI.typography.bodyLarge,
    fontWeight: '800',
    color: UI.colors.primary,
  },

  pickerHeaderDone: {
    fontSize: UI.typography.body,
    fontWeight: '800',
    color: '#1D6CF2',
  },

  flowSpacer: {
    height: 10,
  },

 flowFooter: {
  paddingHorizontal: UI.spacing.xl,
  paddingTop: 10,
  paddingBottom: 8,
  backgroundColor: UI.colors.surface,
  borderTopWidth: 1,
  borderTopColor: '#E5F2F5',
},

  footerMiniSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  footerMiniLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
  },

  footerMiniValue: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '800',
    color: UI.colors.primary,
  },

  footerPrice: {
    fontSize: UI.typography.subtitle,
    fontWeight: '900',
    color: UI.colors.primary,
  },

 primaryButton: {
  minHeight: 50,
  borderRadius: 15,
  paddingHorizontal: 18,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#1D6CF2',
},
  primaryButtonDisabled: {
    backgroundColor: '#CBD5E1',
  },

  primaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: UI.colors.surface,
  },

  primaryButtonArrow: {
    marginLeft: 10,
    fontSize: 19,
    fontWeight: '700',
    color: UI.colors.surface,
  },
})
