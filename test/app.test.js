const net = require('net');
const http = require('http');
const assert = require('chai').assert;
const parser = require('http-string-parser');
const app = require('../app');

const request = (packet) => {
	return new Promise((resolve, reject) => {
		net.connect(server.address().port, function() {
			this.end(packet);
			this.setEncoding('utf-8');

			let res = '';

			this.on('data', (chunk) => res += chunk);
			this.on('end', () => resolve(res));
			this.on('error', reject);
		});
	});
};

const checkMirror = async (requestData, statusCode) => {
	const responseData = await request(requestData);
	const response = parser.parseResponse(responseData);

	assert.equal(response.statusCode, statusCode.toString(), 'status code is 200');
	assert.equal(response.statusMessage, http.STATUS_CODES[statusCode], 'status message is standard');

	assert.equal(response.headers.Connection, 'close', 'connection is set to close');
	assert.equal(response.headers['Cache-Control'], 'no-cache', 'response caching is disabled');
	assert.equal(response.headers['Content-Type'], 'text/plain; charset=utf-8', 'content type is UTF8 text');
	assert.match(response.headers['Content-Length'], /^[0-9]+$/, 'content length is a valid number');
	assert.lengthOf(Object.keys(response.headers), 4, '4 headers are expected');

	assert.equal(response.body, requestData, 'body mirrors HTTP request verbatim');
};

const server = app.listen(0);

describe('app', () => {
	describe('requests with valid data', () => {
		it('GET request should be mirrored', async () => {
			await checkMirror('GET / HTTP/1.1\r\n\r\n', 200);
		});
		it('POST request should be mirrored', async () => {
			await checkMirror('POST / HTTP/1.1\r\n\r\n', 200);
		});
		it('HEAD request should be mirrored', async () => {
			await checkMirror('HEAD / HTTP/1.1\r\n\r\n', 200);
		});
		it('OPTIONS request should be mirrored', async () => {
			await checkMirror('OPTIONS / HTTP/1.1\r\n\r\n', 200);
		});


		it('request headers should be mirrored', async () => {
			await checkMirror('GET / HTTP/1.1\r\nTest: true\r\nAnother-Header:  Some Value\r\n\r\n', 200);
		});
	});

	describe('requests with invalid data', () => {
		it('BAD request should be mirrored', async () => {
			await checkMirror('BAD / HTTP/1.1\r\n\r\n', 400);
		});

		it('GET request should be mirrored', async () => {
			await checkMirror('GET / HTTP\r\n\r\n', 400);
		});

		it('GET request should be mirrored', async () => {
			await checkMirror('GET\r\n\r\n', 400);
		});

		it('GET request should be mirrored', async () => {
			await checkMirror('A\r\n', 400);
		});
	});
});
