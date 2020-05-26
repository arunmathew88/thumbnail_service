'use strict';

const chai = require('chai');
const chai_http = require('chai-http');
const assert = chai.assert;
const expect = chai.expect;
const app = require('../server');
const request = require('supertest');
const path = require('path');

chai.use(chai_http);

describe('Thumbnail Server Express App', function () {
    before(done => {
        app.on("appStarted", function(){
            done();
        });
    });
    describe('GET /', function () {
        it('GET / should return http form response', function () {
            return request(app).get('/')
                .expect(200)
                .expect('content-type', 'text/html')
                .then( res => {
                    assert.include(res.text, '<form');
                })
        });
        it('GET /thumbnails/missingimage.png should return error', function () {
            return request(app).get('/thumbnails/missingimage.png')
                .expect(404)
                .expect('content-type', /^application\/json/)
                .then( res => {
                    expect(res.body).to.have.property('msg');
                    assert.include(res.body.msg, 'Thumbnail does not exist');
                })
        });
        it('POST /upload should process the file upload', function () {
            return request(app).post('/upload')
                .attach("upload", path.resolve(__dirname, "test_image.png"))
                .expect(200)
                .expect('content-type', /^application\/json/)
                .then( res => {
                    expect(res.body).to.have.property('msg');
                    assert.include(res.body.msg, 'Image thumbnailing queued');
                })
        });
    });
});