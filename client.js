const net = require('net');
const fs = require('fs');


const HOST = '127.0.0.1';
const PORT = 3000;


function createRequestPayload(callType, resendSeq = 0) {
    const buffer = Buffer.alloc(2);
    buffer.writeUInt8(callType, 0);
    buffer.writeUInt8(resendSeq, 1);
    return buffer;
}


function parsePacket(buffer) {
    return {
        symbol: buffer.toString('ascii', 0, 4),
        buysellindicator: buffer.toString('ascii', 4, 5),
        quantity: buffer.readInt32BE(5),
        price: buffer.readInt32BE(9),
        packetSequence: buffer.readInt32BE(13),
    };
}


function requestData() {
    const client = new net.Socket();
    let receivedPackets = [];
    let missingSequences = new Set();
    let lastPacketSequence = 0;

    client.connect(PORT, HOST, () => {
        console.log('Connected to server');
        client.write(createRequestPayload(1));
    });

    client.on('data', (data) => {
        const packet = parsePacket(data);
        receivedPackets.push(packet);


        lastPacketSequence = Math.max(lastPacketSequence, packet.packetSequence);


        if (receivedPackets.length > 1) {
            const lastSequence = receivedPackets[receivedPackets.length - 2].packetSequence;
            for (let seq = lastSequence + 1; seq < packet.packetSequence; seq++) {
                missingSequences.add(seq);
            }
        }
    });

    client.on('end', () => {
        console.log('Connection closed');
        handleMissingSequences(receivedPackets, missingSequences, lastPacketSequence);
    });

    client.on('error', (err) => {
        console.error(`Error: ${err.message}`);
    });
}


function handleMissingSequences(packets, missingSequences, lastPacketSequence) {
    if (missingSequences.size === 0) {
        generateJsonOutput(packets);
        return;
    }

    const client = new net.Socket();
    client.connect(PORT, HOST, () => {
        missingSequences.forEach((seq) => {
            client.write(createRequestPayload(2, seq));
        });
    });

    client.on('data', (data) => {
        const packet = parsePacket(data);
        packets.push(packet);


        missingSequences.delete(packet.packetSequence);

        if (missingSequences.size === 0) {
            client.end();
            generateJsonOutput(packets);
        }
    });

    client.on('error', (err) => {
        console.error(`Error: ${err.message}`);
    });
}


function generateJsonOutput(packets) {
    packets.sort((a, b) => a.packetSequence - b.packetSequence);
    const jsonData = JSON.stringify(packets, null, 2);
    fs.writeFileSync('output.json', jsonData);
    console.log('JSON output generated: output.json');
}

requestData();