FROM node:12.16.3

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 8080

CMD [ "node", "server.js" ]
