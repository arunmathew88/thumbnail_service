var express = require("express"),
    app = module.exports = express(),
    formidable = require('formidable'),
    util = require('util'),
    path = require('path'),
    resque = require('node-resque'),
    gm = require('gm').subClass({ imageMagick: true });

async function boot() {

    app.use(express.static('public'))

    app.get('/', function (req, res) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        var form = '<form action="/upload" enctype="multipart/form-data" method="post">' +
            '<h1>Generate Thumbnail</h1>Select File<br><br><input name="upload" type="file" /><br><br>' +
            '<input type="submit" value="Upload" /></form>';
        res.end(form);
    });

    app.get('/thumbnails/*', function (req, res) {
        res.status(404).send({ 'msg': 'Thumbnail does not exist (yet). If you submitted a job, please check after a few more seconds' });
    });


    const connectionDetails = {
        pkg: "ioredis",
        host: "redis",
        password: null,
        port: 6379,
        database: 0,
    };

    const jobs = {
        generateThumbnail: {
            perform: async (image_path, thumbnail_path) => {
                gm(image_path)
                    .resize('100', '100', '^')
                    .gravity('center')
                    .extent(100, 100)
                    .write(thumbnail_path, function (error) {
                        if (error) console.error("Thumbnail generation failed.\n" + error);
                        else console.log("Thumbnail generated.");
                    });

            },
        }
    };

    const worker = new resque.Worker(
        { connection: connectionDetails, queues: ["requestQueue"] },
        jobs
    );
    await worker.connect();
    worker.start();
    worker.on("error", (error, queue, job) => {
        console.log(`error ${queue} ${JSON.stringify(job)}  >> ${error}`);
    });
    worker.on("cleaning_worker", (worker, pid) => {
        console.log(`cleaning old worker ${worker}`);
    });

    const scheduler = new resque.Scheduler({ connection: connectionDetails });
    await scheduler.connect();
    scheduler.start();
    scheduler.on("error", (error) => {
        console.log(`scheduler error >> ${error}`);
    });
    scheduler.on("cleanStuckWorker", (workerName, errorPayload, delta) => {
        console.log(
            `failing ${workerName} (stuck for ${delta}s) and failing job ${errorPayload}`
        );
    });

    const queue = new resque.Queue({ connection: connectionDetails }, jobs);
    queue.on("error", function (error) { console.log(error); });
    await queue.connect();


    app.post('/upload', function (req, res) {
        var form = new formidable.IncomingForm();
        form.maxFileSize = 20 * 1024 * 1024;
        form.maxFieldsSize = 20 * 1024;

        form.parse(req, async (err, fields, files) => {
            if (err) {
                console.error('Image upload failed. ' + err);
                res.status(500).send({ 'msg': 'Image upload failed.' + JSON.stringify(err) });
            } else {
                var file_path = files.upload.path;
                var file_name = files.upload.name;
                var thumbnail_path = path.join(__dirname, 'public', 'thumbnails', file_name);
                console.log(util.inspect({ fields: file_path, files: file_name }));
                queue.enqueue('requestQueue', "generateThumbnail", [file_path, thumbnail_path]);
                console.log('generateThumbnail request queued.');
                console.log(util.inspect({ fields: fields, files: files }));
                var full_url = req.protocol + '://' + req.get('host') + '/thumbnails/' + file_name;
                res.json({ 'msg': 'Image thumbnailing queued. After job completion the thumbnail would be available at ' + full_url });
            }
        });

    });

    let server = app.listen(8080, function () {
        console.log('Server running.');
        app.emit("appStarted");
    });

    process.on('SIGTERM', shut_down);
    process.on('SIGINT', shut_down);

    async function shut_down() {
        console.log('Initiating graceful shutdown.');
        setTimeout(() => {
            console.error('Timed out! Forcefully shutting down');
            process.exit(1);
        }, 10000);

        if (server ) server.close();
        await queue.end();
        await scheduler.end();
        await worker.end();
        process.exit(0);
    }


}

boot();

