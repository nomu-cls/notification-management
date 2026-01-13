/**
 * API Endpoint to fetch Chatwork room members
 * 
 * GET /api/chatwork/members?roomId=xxx&token=xxx
 * 
 * Returns list of room members for UI selection
 */

export default async function handler(req, res) {
    // Only allow GET
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { roomId, token } = req.query;

    if (!roomId || !token) {
        return res.status(400).json({ error: 'Missing roomId or token' });
    }

    try {
        const response = await fetch(`https://api.chatwork.com/v2/rooms/${roomId}/members`, {
            headers: {
                'X-ChatWorkToken': token
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            return res.status(response.status).json({
                error: `Chatwork API error: ${response.status}`,
                detail: errorText
            });
        }

        const members = await response.json();

        // Return simplified member list
        const simplifiedMembers = members.map(m => ({
            id: m.account_id,
            name: m.name,
            role: m.role // admin, member, readonly
        }));

        return res.status(200).json({ members: simplifiedMembers });

    } catch (error) {
        console.error('Failed to fetch Chatwork members:', error);
        return res.status(500).json({ error: error.message });
    }
}
