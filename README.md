# POS Tagger — NLP Studio

https://pos-tagger-nlp.onrender.com

An interactive **Natural Language Processing** application that compares four real NLTK Part-of-Speech tagging approaches:

- Rule-Based RegexpTagger
- Statistical UnigramTagger
- Hidden Markov Model (HMM)
- Transformation-Based Brill Tagger

The application trains on the **Brown Corpus (news category)**, evaluates each tagger on a held-out split, and lets users inspect POS decisions for their own sentences.

## ✨ Features

- Interactive sentence analysis
- Token-by-token POS visualization
- Four real NLP tagging models
- Brown Corpus training and evaluation
- Accuracy comparison
- Side-by-side model agreement table
- Highlighting of model disagreements
- Responsive dark editorial-style UI
- Flask API + HTML/CSS/JavaScript frontend

## 🧠 NLP Pipeline

```text
Brown Corpus
    ↓
Train / Test Split
    ↓
┌──────────────┬──────────────┬──────────────┬──────────────────┐
│ Rule-Based   │ Unigram      │ HMM          │ Brill            │
│ Regex Rules  │ Frequency    │ Viterbi      │ Transformations  │
└──────────────┴──────────────┴──────────────┴──────────────────┘
    ↓
POS Tag Prediction
    ↓
Accuracy + Model Agreement
```

## 🛠️ Tech Stack

Python · Flask · NLTK · Pandas · HTML · CSS · JavaScript · Gunicorn

## 🚀 Run Locally

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open:

```text
http://127.0.0.1:5000
```

On first run, NLTK downloads the Brown Corpus and universal tagset resources if they are not already available.

## 📁 Structure

```text
pos_tagger_nlp_studio/
├── app.py
├── requirements.txt
├── README.md
├── templates/
│   └── index.html
└── static/
    ├── app.js
    └── style.css
```

## 📊 Models

### Rule-Based
Uses ordered regular-expression patterns. No training data is required.

### Statistical
Uses a UnigramTagger that selects the most frequent tag observed for a word in training data.

### HMM
Uses a Hidden Markov Model and Viterbi decoding to find a likely tag sequence.

### Transformation-Based
Uses a Brill tagger trained from unigram predictions and learned correction rules.

## 🌐 Deployment

This Flask application can be deployed to Render using:

```text
Build Command:
pip install -r requirements.txt

Start Command:
gunicorn app:app
```

## 👩‍💻 Authors

**Siddiqui Mehvish**  
**Siddiqui Kashish**
