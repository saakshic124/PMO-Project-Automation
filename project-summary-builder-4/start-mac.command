#!/bin/bash
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "No .env file found. Create one (copy .env.example to .env and add your API key) before running this."
  read -p "Press Enter to close..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies (first run only)..."
  npm install
fi

echo ""
echo "Starting the app — leave this window open while you use it."
echo "Once it says 'listening on port 3000', open http://localhost:3000 in your browser."
echo "To stop it, close this window or press Control+C."
echo ""
npm start
