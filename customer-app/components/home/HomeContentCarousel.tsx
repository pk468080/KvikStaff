import { useEffect, useRef, useState } from 'react'
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'

export type HomeContentCarouselItem = {
  id: string
  title: string
  description: string | null
  ctaText: string | null
  imageUrl: string | null
  serviceId: string | null
}

type HomeContentCarouselProps = {
  variant: 'hero' | 'updates'
  items: HomeContentCarouselItem[]
  onItemPress: (item: HomeContentCarouselItem) => void
}

const UPDATE_CARD_GAP = 12
const HERO_ROTATION_MS = 5_000
const UPDATE_ROTATION_MS = 6_500

export default function HomeContentCarousel({
  variant,
  items,
  onItemPress,
}: HomeContentCarouselProps) {
  const listRef = useRef<FlatList<HomeContentCarouselItem>>(null)
  const activeIndexRef = useRef(0)
  const [activeIndex, setActiveIndex] = useState(0)
  const [viewportWidth, setViewportWidth] = useState(0)
  const isHero = variant === 'hero'
  const gap = isHero ? 0 : UPDATE_CARD_GAP
  const cardWidth = isHero
    ? viewportWidth
    : Math.min(272, Math.max(220, viewportWidth * 0.78))
  const scrollStep = cardWidth + gap
  const visibleIndex = items.length > 0 ? activeIndex % items.length : 0

  function handleLayout(event: LayoutChangeEvent) {
    const nextWidth = Math.round(event.nativeEvent.layout.width)
    if (nextWidth > 0 && nextWidth !== viewportWidth) {
      setViewportWidth(nextWidth)
    }
  }

  function selectSlide(index: number) {
    const safeIndex = Math.max(0, Math.min(items.length - 1, index))
    activeIndexRef.current = safeIndex
    setActiveIndex(safeIndex)
    listRef.current?.scrollToOffset({
      offset: safeIndex * scrollStep,
      animated: true,
    })
  }

  function handleScrollEnd(
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) {
    if (items.length < 1 || scrollStep <= 0) return
    const nextIndex = Math.max(
      0,
      Math.min(
        items.length - 1,
        Math.round(event.nativeEvent.contentOffset.x / scrollStep),
      ),
    )
    activeIndexRef.current = nextIndex
    setActiveIndex(nextIndex)
  }

  useEffect(() => {
    activeIndexRef.current = 0
    // The list must return to the first slide if admins change the item count.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveIndex(0)
    listRef.current?.scrollToOffset({ offset: 0, animated: false })
  }, [items.length, variant])

  useEffect(() => {
    if (items.length < 2 || scrollStep <= 0) return

    const timer = setInterval(() => {
      const nextIndex = (activeIndexRef.current + 1) % items.length
      activeIndexRef.current = nextIndex
      setActiveIndex(nextIndex)
      listRef.current?.scrollToOffset({
        offset: nextIndex * scrollStep,
        animated: true,
      })
    }, isHero ? HERO_ROTATION_MS : UPDATE_ROTATION_MS)

    return () => clearInterval(timer)
  }, [items.length, isHero, scrollStep])

  if (isHero && items.length === 0) {
    return (
      <View style={styles.heroFallback}>
        <View style={styles.fallbackCircle} />
        <View style={styles.fallbackCircleSmall} />
        <View style={styles.fallbackCopy}>
          <Text style={styles.fallbackEyebrow}>KVIKSTAFF  •  STAFFING, ON DEMAND</Text>
          <Text style={styles.fallbackTitle}>
            Find the right staff when you need them.
          </Text>
          <Text style={styles.fallbackSubtitle}>
            New offers from KvikStaff will appear here.
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View
      style={[styles.root, isHero && styles.heroRoot]}
      onLayout={handleLayout}
    >
      {items.length > 0 && viewportWidth > 0 ? (
        <FlatList
          ref={listRef}
          key={`${variant}-${items.length}`}
          data={items}
          horizontal
          pagingEnabled={isHero}
          snapToInterval={isHero ? viewportWidth : scrollStep}
          snapToAlignment="start"
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          scrollEnabled={items.length > 1}
          keyExtractor={item => `${variant}-${item.id}`}
          getItemLayout={(_, index) => ({
            length: scrollStep,
            offset: scrollStep * index,
            index,
          })}
          contentContainerStyle={!isHero ? styles.updateList : undefined}
          onMomentumScrollEnd={handleScrollEnd}
          renderItem={({ item }) => (
            <Pressable
              style={[
                styles.slide,
                {
                  width: cardWidth,
                  height: isHero ? 224 : 164,
                  marginRight: gap,
                },
              ]}
              onPress={() => onItemPress(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}${item.ctaText ? `. ${item.ctaText}` : ''}`}
            >
              {item.imageUrl ? (
                <Image
                  source={{ uri: item.imageUrl }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                  accessible={false}
                />
              ) : null}
              <View style={styles.slideOverlay} />
              <View style={[styles.slideOrbit, !isHero && styles.updateOrbit]} />
              <View style={[styles.slideCopy, !isHero && styles.updateCopy]}>
                <View style={styles.slideEyebrowPill}>
                  <View style={styles.slideEyebrowDot} />
                  <Text style={styles.slideEyebrowText}>
                    {isHero ? 'FEATURED OFFER' : 'KVIKSTAFF UPDATE'}
                  </Text>
                </View>

                <Text
                  style={[styles.slideTitle, !isHero && styles.updateTitle]}
                  numberOfLines={isHero ? 2 : 2}
                >
                  {item.title}
                </Text>

                {item.description ? (
                  <Text
                    style={[styles.slideDescription, !isHero && styles.updateDescription]}
                    numberOfLines={isHero ? 2 : 2}
                  >
                    {item.description}
                  </Text>
                ) : null}

                {item.ctaText ? (
                  <View style={styles.slideCta}>
                    <Text style={styles.slideCtaText} numberOfLines={1}>
                      {item.ctaText}
                    </Text>
                    <Text style={styles.slideCtaArrow}>›</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          )}
        />
      ) : null}

      {items.length > 1 && viewportWidth > 0 ? (
        <View style={styles.pagination}>
          {items.map((item, index) => (
            <Pressable
              key={`${variant}-dot-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Show slide ${index + 1}`}
              onPress={() => selectSlide(index)}
              style={[
                styles.paginationDot,
                visibleIndex === index && styles.paginationDotActive,
                isHero && visibleIndex === index && styles.heroPaginationDotActive,
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  heroRoot: {
    marginBottom: 20,
  },
  slide: {
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    borderRadius: 22,
    backgroundColor: '#0A3972',
  },
  updateList: {
    paddingRight: 4,
  },
  slideOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(5, 24, 42, 0.56)',
  },
  slideOrbit: {
    position: 'absolute',
    top: -52,
    right: -28,
    width: 190,
    height: 190,
    borderRadius: 95,
    borderWidth: 1,
    borderColor: 'rgba(120,226,224,0.42)',
    backgroundColor: 'rgba(120,226,224,0.10)',
  },
  updateOrbit: {
    width: 128,
    height: 128,
    borderRadius: 64,
    right: -26,
    top: -36,
  },
  slideCopy: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    alignItems: 'flex-start',
  },
  updateCopy: {
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
  slideEyebrowPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  slideEyebrowDot: {
    width: 6,
    height: 6,
    marginRight: 7,
    borderRadius: 3,
    backgroundColor: '#0784FB',
  },
  slideEyebrowText: {
    color: '#0A3972',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  slideTitle: {
    maxWidth: 310,
    marginTop: 13,
    color: '#FFFFFF',
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  updateTitle: {
    marginTop: 10,
    fontSize: 17,
    lineHeight: 21,
    letterSpacing: -0.1,
  },
  slideDescription: {
    maxWidth: 315,
    marginTop: 7,
    color: '#E0EDF5',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  updateDescription: {
    marginTop: 5,
    fontSize: 11,
    lineHeight: 15,
  },
  slideCta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    marginTop: 10,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  slideCtaText: {
    color: '#0A3972',
    fontSize: 10,
    fontWeight: '900',
  },
  slideCtaArrow: {
    marginLeft: 7,
    color: '#0784FB',
    fontSize: 17,
    lineHeight: 17,
    fontWeight: '900',
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 11,
    paddingBottom: 2,
  },
  paginationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C8D9E3',
  },
  paginationDotActive: {
    width: 18,
    backgroundColor: '#0784FB',
  },
  heroPaginationDotActive: {
    backgroundColor: '#0784FB',
  },
  heroFallback: {
    position: 'relative',
    minHeight: 224,
    marginBottom: 20,
    padding: 22,
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 22,
    backgroundColor: '#0A3972',
  },
  fallbackCircle: {
    position: 'absolute',
    top: -45,
    right: -12,
    width: 190,
    height: 190,
    borderRadius: 95,
    borderWidth: 1,
    borderColor: 'rgba(120,226,224,0.48)',
    backgroundColor: 'rgba(120,226,224,0.09)',
  },
  fallbackCircleSmall: {
    position: 'absolute',
    right: 28,
    bottom: -62,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(7,132,251,0.18)',
  },
  fallbackCopy: {
    maxWidth: 300,
    alignItems: 'flex-start',
  },
  fallbackEyebrow: {
    color: '#78E2E0',
    fontSize: 10,
    lineHeight: 16,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  fallbackTitle: {
    marginTop: 11,
    color: '#FFFFFF',
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  fallbackSubtitle: {
    marginTop: 9,
    color: '#D8E7F1',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
})
