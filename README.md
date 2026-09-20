# NutriSnap — AI Food Analyzer with Ollama + Gemma 3

NutriSnap is a simple local web app that lets you upload a photo of your food and get an AI-estimated nutrition breakdown.

It can identify the food in the image and give you:

- An estimated health score
- Calories
- Protein, carbs, fat, and fiber
- Vitamins and minerals
- Things that are good about the meal
- Things you may want to watch out for

Everything runs locally using Ollama and Gemma 3.

## What You Need

Before starting, make sure you have:

- Node.js 18 or newer
- Ollama 0.6 or newer
- A Gemma 3 model that supports images

For most computers, `gemma3:4b` is a good place to start.

## 1. Download Gemma 3

Open your terminal and run:

    ollama pull gemma3:4b

Make sure Ollama is running before starting the app.

## 2. Install NutriSnap

Open the NutriSnap project folder in your terminal and run:

    npm install

This installs everything the app needs.

## 3. Start the App

Run:

    npm start

Then open this in your browser:

    http://localhost:3000

You can now upload a food photo and analyze it.

## Using a Larger Gemma 3 Model

If your computer has more RAM or a stronger GPU, you can try a larger model for potentially better image analysis.

### macOS or Linux

    OLLAMA_MODEL=gemma3:12b npm start

### Windows PowerShell

    $env:OLLAMA_MODEL="gemma3:12b"
    npm start

You can also try `gemma3:27b` if your computer can handle it.

## Using a Different Ollama Server

By default, NutriSnap connects to Ollama at:

    http://127.0.0.1:11434

If Ollama is running somewhere else, you can change it like this:

    OLLAMA_URL=http://127.0.0.1:11434 npm start

Replace the address with your own Ollama server if needed.

## Important Notes

NutriSnap estimates nutrition from a photo, so the results may not be completely accurate.

The model cannot always know the exact:

- Portion size
- Ingredients
- Cooking oils
- Sauces
- Seasonings
- Hidden ingredients