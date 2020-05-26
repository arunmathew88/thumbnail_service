
# Introduction
This file describes how to run and test the thumbnail server, 
its components, architecture and the future scope. 

I have never developed a NodeJS application, nor have I worked with redist or resque yet.
The closest I have done is some JS coding using YUI Library 10 years ago, and a few fixes for some NodeJS application.
It took a while for me to learn through the unfamiliar territory.
I have marked most of the materials I used/learned from in the [References](#references) section.
The resque demo in particular was so outdated, the library evolved from callback functions to promises to async/await in the meantime.  
 
# Quick Start
## Start Service
Starting the service is as simple as 
```
docker-compose up -d
```
You can then reach the following endpoints
 
 * `http://localhost:8080/` : To access the simple webform for uploading image.
 * `http://localhost:8080/upload` : The REST endpoint for POST request with file to generate thumbnail of.
 * `http://localhost:8080/thumbnails/<filename>` : The static endpoint where the processed images are available 
 upon job completion.
 * `http://localhost:8081/` : To access the redis-commander UI, to monitor the redis database. You can see the queues,
  workers and some statistics through this.
  
## Stop Service
You may stop the services by
```
docker-compose stop
```

## Run Tests
The following command starts the services in the main `docker-compose.yml` along with 
the test container defined in `system_test/docker-compose.yml`.
This runs the python tests based on pytest and stops all services upon completion of the tests. 
 
```
docker-compose -f docker-compose.yml -f system_test/docker-compose.yml up --exit-code-from system-test
```

# Architecture
The following diagram shows the various containers and connections involved.

![Alt text](docs/architecture.png?raw=true "Architecture")

The WebApp container runs the NodeJS application.
Redis container runs the redis db service.
Redis-commander container runs the redis-commander service, which is a web management tool for redis.
It is not really essential for the current application, but I thought it is good to inspect the redis queues and workers,
as a means to monitor job progress. 
Also, it pretty much worked out of the box, so I didn't have to do much configuration.

NodeJS was chosen to implement the WebApp part because of the high number of connections it can handle, 
as long as the requests are not cpu bound.
Now the thumbnail generation process is cpu bound, 
and doing it inline would make the application less available/responsive.
Resque is a background job queue created by github, to tackle their issues with other queue libraries.
node-resque is the equivalent implementation in NodeJS, which is made API compatible with the ruby version.
It uses redis db to store the job queues, worker state etc.

When a new image is uploaded for thumbnail generation, a generateThumbnail job is created and added to the requestQueue.
The NodeJS express endpoint `/upload` only creates and enqueues the request.
This leaves the process available to process other requests, making it much more available than inline processing.

The resque library periodically polls the requestQueue for any pending jobs and executes the actual generateThumbnail job whenever cpu is idle.
The result of the job is stored in the `public/thumbnails/` folder with the same filename.
The user can fetch the generated thumbnail via `/thumbnails/:filename` endpoint.

The `/thumbnails/` is in the static path `public/`, and handled by the static middleware of express.

At first I thought of returning the thumbnail against the same POST request.
I thought by doing so I can try to avoid hitting the disk with the intermediate images.
But as that involves a lot of active connections waiting for a response,
I decided against it and responded with the URL where the resulting thumbnail would be available at the completion of the job.
  
 
# Tests
I implemented a couple of test cases via mocha and chai for nodejs.
These tests are available in `test/server.test.js`.
You can run these tests by `npm run test` command.

But I realized later that the system/integration tests should better be run from a separate test container.
So I reimplemented these tests along with an end to end thumbnail generation and validation test, in python.
I have also implemented one test case which sends 100 concurrent requests.
This case can be further enhanced for load/performance testing. 

The python based test case is in the `system_test/` path. It has its own `Dockerfile` and a `docker-compose.yml`.
This Dockerfile packages the test and test dependencies into a container,
which can be plugged in to the main service cluster by means of the `system_test/docker-compose.yml` file.

The test output can be logged to a mounted volume so that it can be used after test completion.
As per the command I referred above, the result would be logged in the console and the services would stop after test execution.

We can include tests for 
* more filetypes
* oversized file - connection should break
* unsupported file
 

# Monitoring
I have currently included a redis-commander service for a very basic inspection of the redis queues.

There are more specialized monitoring services for resque job like https://github.com/actionhero/ah-resque-ui.

We can use nagios/prometheus for monitoring the health of individual services like redis db, web.
We can also generate metrics about the resque jobs, and create necessary alerts.  
 

# Deployment
For production deployment 
* the redis container should use ephemeral storage for persisting data
* the `static/thumbnails` path where the resulting thumbnails are stored should be ephemeral

So that the service can be brought up and down without data loss.

Regarding where and how to deploy, based on the scale and capacity we can 
* run all these containers in a single commodity server
* run each container in separate servers (after exposing redis port and parameterizing redis hostname / connection details)
* use kubernetes for container orchestration (auto-scaling, self-healing)
* deploy the above service to Google cloud platform, AWS or similar cloud services.



# Future Improvements 
* Having more instances of WebApp container and having them run behind a load balancer.
  This way we can handle a lot more incoming requests.
  The jobs are enqueued in resque and processed when there is available cpu.
  If the request load is significant we may need to scale the redis service for higher writes. 
* Using [resque multiworker](https://github.com/actionhero/node-resque#multi-worker) instead of worker.
  This way multiple jobs can be processed at a time subject to cpu availability.
  It has auto-scaling features too.
* We can replace the ImageMagick resize function with an external api call so that the cpu bound process is outsourced to an external service.
  We can use a separate in house service which may use the ImageMagisk, or use service like [AWS lambda](https://aws.amazon.com/blogs/compute/resize-images-on-the-fly-with-amazon-s3-aws-lambda-and-amazon-api-gateway/).
  This way our application can handle even more requests.
* If there are significant read requests for the static content i.e generated thumbnail we can use CDN.
* If we use an external storage for the static content (thumbnail generated and original image), then the WebApp is stateless
* We can use kubernetes for the container orchestration, auto-scaling and self-healing of stateless services.
         
# References

The main pages, tutorials, demos which I referred or took inspiration from. 
* https://github.blog/2009-11-03-introducing-resque/
* https://www.npmjs.com/package/node-resque
* https://nodejs.org/docs/latest-v12.x/api/worker_threads.html
* https://www.npmjs.com/package/redis-commander
* https://www.youtube.com/watch?v=MLTRHc5dk6s Mocha
* https://www.youtube.com/watch?v=lnIyqXBn2Lg more Mocha
* https://www.youtube.com/watch?v=NNTsHzER31I Background Tasks in Node
* https://stackabuse.com/testing-node-js-code-with-mocha-and-chai/
* https://stackoverflow.com/questions/32695244/how-to-mock-dependency-classes-for-unit-testing-with-mocha-js
* https://medium.com/@NetflixTechBlog/netflix-images-enhanced-with-aws-lambda-9eda989249bf


