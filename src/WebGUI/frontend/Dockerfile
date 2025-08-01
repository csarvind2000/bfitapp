FROM node:22-alpine 

WORKDIR /app 
COPY . .
RUN npm install
RUN npx patch-package

CMD ["npm", "run", "dev"] 
