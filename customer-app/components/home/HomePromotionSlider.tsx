import { StyleSheet, Text, View } from 'react-native'
import { UI } from '../../constants/ui';

export default function HomePromotionSlider() {
	return (
		<View style={styles.container}>
			<Text style={styles.title}>Trusted help, when you need it</Text>
			<Text style={styles.subtitle}>Book verified professionals for your home.</Text>
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		marginHorizontal: 20,
		marginVertical: 12,
		padding: 18,
		borderRadius: UI.radius.lg,
		backgroundColor: '#E0F2FE',
	},
	title: { fontSize: UI.typography.subtitle, fontWeight: '700', color: '#0C4A6E' },
	subtitle: { marginTop: 6, color: '#075985' },
})
