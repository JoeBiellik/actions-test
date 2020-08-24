const http = require('http');
const util = require('util');
const config = require('config');
const bytes = require('bytes');

const maxBodyBytes = bytes.parse(config.maxSize.body);
const maxHeaderBytes = bytes.parse(config.maxSize.header);

const message = 'HTTP/1.1 %i %s\r\nConnection: close\r\nCache-Control: no-cache\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: %i\r\n\r\n%s';
const body413 = `413 ${http.STATUS_CODES[413]}\r\nMaximum request body size is ${config.maxSize.body} (${maxBodyBytes} bytes)`;
const body431 = `431 ${http.STATUS_CODES[431]}\r\nMaximum total request header size is ${config.maxSize.header} (${maxHeaderBytes} bytes)`;
const message413 = util.format(message, 413, http.STATUS_CODES[413], body413.length, body413);
const message431 = util.format(message, 431, http.STATUS_CODES[431], body431.length, body431);

const server = http.createServer({ maxHeaderSize: maxHeaderBytes }, (req, res) => {
	res.chunkedEncoding = false;
	res.shouldKeepAlive = false;

	const process = (chunk) => {
		size += chunk.byteLength;

		if (size > maxBodyBytes) {
			req.off('data', process);
			req.off('end', end);

			res.end(message413);
		} else {
			data.push(chunk);
		}
	};

	const end = () => {
		const buffer = Buffer.concat(data);

		res.socket.end(util.format(message, 200, http.STATUS_CODES[200], buffer.byteLength, buffer));
	};

	if (req.headers['content-length'] > maxBodyBytes) return res.socket.end(message413);

	let size = 0;

	const data = [
		Buffer.from(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${req.rawHeaders.map((v, i) => (i % 2 ? `${v}\r\n` : `${v}: `)).join('')}\r\n`, 'binary')
	];

	req.on('data', process);
	req.on('end', end);
});

server.on('clientError', (err, socket) => {
	if (err.code === 'ECONNRESET' || !socket.writable || socket.bytesWritten > 0) return socket.destroy();

	if (err.code === 'HPE_HEADER_OVERFLOW') {
		socket.end(message431);
	} else {
		socket.end(util.format(message, 400, http.STATUS_CODES[400], err.rawPacket.byteLength, err.rawPacket));
	}

	socket.destroy();
});

server.timeout = config.timeout;
server.headersTimeout = config.timeout;

module.exports = server;
