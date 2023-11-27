# Use an official Node.js runtime as a parent image
FROM node:16

# Create a directory to store your application code inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install application dependencies
RUN npm install
RUN npm install express body-parser puppeteer path jsdom


# Copy the rest of the application code into the container
COPY . .

# Specify the command to run your application (use "payload.js" as the main file)
CMD ["npm", "run", "start"]
