const supertest = require('supertest');
const app = require('../app');

const request = supertest(app);
request.method = (method, path) => supertest.agent(app)[method](path);

module.exports = request;
