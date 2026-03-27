const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Initialise Firebase Admin une seule fois
if (!getApps().length) {
    initializeApp({
        credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
}
const db = getFirestore();

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).end();

    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error('Webhook signature error:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;

        try {
            // Récupérer les articles de la session Stripe
            const lineItems = await stripe.checkout.sessions.listLineItems(session.id);

            const items = lineItems.data.map(item => ({
                name: item.description,
                quantity: item.quantity,
                price: item.amount_total / 100 / item.quantity,
                lineTotal: item.amount_total / 100,
            }));

            // Calculer le prochain numéro de commande
            const snapshot = await db.collection('commandes').orderBy('orderNumber', 'desc').limit(1).get();
            const lastOrder = snapshot.docs[0]?.data();
            const orderNumber = (lastOrder?.orderNumber || 0) + 1;

            // Créer la commande dans Firestore
            await db.collection('commandes').add({
                orderNumber,
                customerName: session.metadata.customerName || 'Client',
                phone: session.metadata.phone || '',
                orderType: session.metadata.orderType || 'a_emporter',
                notes: session.metadata.notes || '',
                status: 'nouvelle',
                paye: true,
                stripeSessionId: session.id,
                items,
                total: session.amount_total / 100,
                createdAt: new Date().toISOString(),
            });

            console.log(`✅ Commande #${orderNumber} créée dans Firebase`);
        } catch (err) {
            console.error('Erreur Firebase:', err.message);
            return res.status(500).json({ error: err.message });
        }
    }

    res.json({ received: true });
};
