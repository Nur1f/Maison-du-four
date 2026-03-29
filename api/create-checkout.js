const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { items, customerName, phone, orderType, notes } = req.body;

    const line_items = items.map(item => {
        let description = '';
        if (item.viande) description += item.name.toLowerCase().includes('wings') || item.name.toLowerCase().includes('nuggets') ? `Type : ${item.viande}` : `Viande : ${item.viande}`;
        if (item.removed?.length) description += `${description ? ' — ' : ''}Sans : ${item.removed.join(', ')}`;
        return {
            price_data: {
                currency: 'eur',
                product_data: {
                    name: item.name,
                    ...(description && { description })
                },
                unit_amount: Math.round(item.price * 100),
            },
            quantity: item.quantity,
        };
    });

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items,
            mode: 'payment',
            success_url: `https://maison-du-four.vercel.app/index.html?success=1&session={CHECKOUT_SESSION_ID}`,
            cancel_url: `https://maison-du-four.vercel.app/index.html?cancelled=1`,
            // On stocke TOUS les items en metadata pour que le webhook puisse les récupérer avec la viande
            metadata: {
                customerName,
                phone,
                orderType,
                notes: notes || '',
                items: JSON.stringify(items) // ← clé du fix
            },
        });

        res.status(200).json({ url: session.url });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
