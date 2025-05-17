import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';

const whiteboards = {};

function broadcast(whiteboardId, data, clients) {
    if (clients[whiteboardId] && clients[whiteboardId].users) {
        const message = JSON.stringify(data);
        for (const userId in clients[whiteboardId].users) {
            try {
                clients[whiteboardId].users[userId].send(message);
            } catch (error) {
                console.error('Failed to broadcast message:', error);
            }
        }
    }
}

const setupWebSocket = (server) => {
    const wss = new WebSocketServer({ noServer: true, path: '/ws' });

    wss.on('connection', ws => {
        let whiteboardId;
        let userId = uuidv4();

        console.log('WebSocket connected');

        ws.on('message', async message => {
            try {
                const data = JSON.parse(message.toString());
                whiteboardId = data.whiteboardId;
                console.log('Received message:', data); // Log received messages

                if (data.type === 'join') {
                    if (!whiteboards[whiteboardId]) {
                        whiteboards[whiteboardId] = { elements: {}, users: {} };
                    }
                    whiteboards[whiteboardId].users[userId] = ws;
                    ws.send(JSON.stringify({ type: 'initial', elements: whiteboards[whiteboardId].elements, userId }));
                    broadcast(whiteboardId, { type: 'userJoined', userId }, whiteboards);
                } else if (data.type === 'draw' || data.type === 'text' || data.type === 'stickyNote' || data.type === 'image' || data.type === 'move' || data.type === 'edit' || data.type === 'delete') {
                    if (whiteboards[whiteboardId] && whiteboards[whiteboardId].elements[data.elementId]) {
                        whiteboards[whiteboardId].elements[data.elementId] = { ...whiteboards[whiteboardId].elements[data.elementId], ...data.payload };
                    } else if (data.type !== 'move' && data.type !== 'edit') {
                        const elementId = uuidv4();
                        whiteboards[whiteboardId].elements[elementId] = { ...data.payload, id: elementId, type: data.type, userId };
                        data.payload.id = elementId; // Ensure the sender also gets the ID
                    }
                    broadcast(whiteboardId, data, whiteboards);
                } else if (data.type === 'panZoom') {
                    broadcast(whiteboardId, data, whiteboards); // Broadcast pan and zoom updates
                }
            } catch (error) {
                console.error('Failed to parse message or handle WebSocket event:', error);
            }
        });

        ws.on('close', () => {
            if (whiteboardId && whiteboards[whiteboardId] && whiteboards[whiteboardId].users[userId]) {
                delete whiteboards[whiteboardId].users[userId];
                broadcast(whiteboardId, { type: 'userLeft', userId }, whiteboards);
                if (Object.keys(whiteboards[whiteboardId].users).length === 0) {
                    delete whiteboards[whiteboardId]; // Clean up if no users are left
                }
            }
            console.log(`User ${userId} disconnected from whiteboard ${whiteboardId}`);
        });

        ws.on('error', error => {
            console.error(`WebSocket error for user ${userId} on whiteboard ${whiteboardId}:`, error);
        });
    });

    return wss;
};

export { setupWebSocket, whiteboards };