import { StyleSheet } from 'react-native'

export const styles = StyleSheet.create({
  pageContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 40,
  },

  header: {
    marginBottom: 16,
  },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
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
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    color: '#062F52',
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
    padding: 16,
    marginBottom: 12,
    borderRadius: 18,
    backgroundColor: '#062F52',
  },

  serviceHeroImageWrap: {
    width: 62,
    height: 62,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
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
    color: '#062F52',
  },

  serviceHeroContent: {
    flex: 1,
    minWidth: 0,
  },

  serviceHeroName: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  serviceHeroPrice: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
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
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5F2F5',
  },

  locationIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
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
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    color: '#062F52',
  },

  availabilityShell: {
    marginBottom: 12,
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
    backgroundColor: '#16A34A',
    marginRight: 8,
  },

  availabilityDetailsText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#087F72',
  },

  sectionDescription: {
    marginTop: -3,
    marginBottom: 12,
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5F2F5',
  },

  methodCardSelected: {
    borderColor: '#062F52',
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
    backgroundColor: '#00A7A7',
  },

  methodIconText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#37657A',
  },

  methodIconTextSelected: {
    color: '#FFFFFF',
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
    color: '#062F52',
  },

  methodDescription: {
    marginTop: 4,
    paddingRight: 4,
    fontSize: 12,
    lineHeight: 17,
    color: '#5E7C8B',
  },

  availableBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#DDF7F0',
  },

  availableBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#087F72',
  },

  unavailableBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
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
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },

  radioOuterSelected: {
    borderColor: '#062F52',
  },

  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#00A7A7',
  },

  bottomTrustCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding: 14,
    marginTop: 2,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#16A34A',
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
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
    color: '#062F52',
    fontWeight: '400',
  },

  headerCloseText: {
    fontSize: 28,
    lineHeight: 32,
    color: '#062F52',
    fontWeight: '400',
  },

  flowHeaderCenter: {
    flex: 1,
    alignItems: 'center',
  },

  flowTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
    color: '#062F52',
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
    backgroundColor: '#00A7A7',
    borderRadius: 2,
  },

 flowContent: {
  flexGrow: 1,
  paddingHorizontal: 20,
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
  marginTop: 4,
  fontSize: 22,
  lineHeight: 27,
  fontWeight: '800',
  color: '#062F52',
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
    backgroundColor: '#FFFFFF',
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
    fontSize: 12,
    lineHeight: 17,
    color: '#37657A',
  },

  emptySlotsCard: {
    marginTop: 18,
    padding: 18,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5F2F5',
    alignItems: 'center',
  },

  emptySlotsTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#062F52',
    textAlign: 'center',
  },

  emptySlotsText: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    color: '#5E7C8B',
    textAlign: 'center',
  },

  slotDisclaimer: {
    marginTop: 12,
    fontSize: 11,
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
    backgroundColor: '#FFFFFF',
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
    color: '#062F52',
  },

  slotCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
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
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  stepDescription: {
  marginTop: 12,
  marginBottom: 14,
  fontSize: 12.5,
  lineHeight: 18,
  color: '#5E7C8B',
},

  selectionCard: {
  flexDirection: 'row',
  alignItems: 'center',
  minHeight: 88,
  marginTop: 4,
  paddingHorizontal: 14,
  paddingVertical: 13,
  borderRadius: 16,
  backgroundColor: '#FFFFFF',
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
  color: '#062F52',
},

  selectionHint: {
    marginTop: 2,
    fontSize: 11,
    color: '#5E7C8B',
  },

  chevron: {
    marginLeft: 8,
    fontSize: 28,
    color: '#94A3B8',
  },

  contextCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#F1F7F9',
  },

  contextIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
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
    color: '#062F52',
  },

  contextHint: {
    marginTop: 2,
    fontSize: 11,
    color: '#5E7C8B',
  },

  subheading: {
    marginTop: 20,
    marginBottom: 10,
    fontSize: 16,
    fontWeight: '800',
    color: '#062F52',
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
    backgroundColor: '#FFFFFF',
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
    fontSize: 14,
    fontWeight: '700',
    color: '#174C68',
  },

  durationOptionTextSelected: {
    color: '#062F52',
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
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  endTimeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
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
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: '#B86A20',
  },

  previewCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5F2F5',
  },

  previewTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#062F52',
    marginBottom: 8,
  },

  summaryCard: {
    marginTop: 18,
    padding: 15,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
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
    fontSize: 11,
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
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    color: '#062F52',
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
    color: '#FFFFFF',
  },

  liveCheckContent: {
    flex: 1,
  },

  liveCheckTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#062F52',
  },

  liveCheckText: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    color: '#4D6680',
  },

  waitingPriceCard: {
    marginTop: 14,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5F2F5',
  },

  waitingPriceTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#062F52',
  },

  waitingPriceText: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: '#5E7C8B',
  },

  pickerModal: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },

  pickerSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingBottom: 28,
  },

  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },

  pickerHeaderButton: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },

  pickerHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#062F52',
  },

  pickerHeaderDone: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1D6CF2',
  },

  flowSpacer: {
    height: 10,
  },

 flowFooter: {
  paddingHorizontal: 20,
  paddingTop: 10,
  paddingBottom: 8,
  backgroundColor: '#FFFFFF',
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
    color: '#062F52',
  },

  footerPrice: {
    fontSize: 18,
    fontWeight: '900',
    color: '#062F52',
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
    color: '#FFFFFF',
  },

  primaryButtonArrow: {
    marginLeft: 10,
    fontSize: 19,
    fontWeight: '700',
    color: '#FFFFFF',
  },
})
