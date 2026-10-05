import os
import re
import nltk
import pandas as pd
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

CORPUS_LIMIT = 3000
TRAIN_FRACTION = 0.8

RULE_PATTERNS = [
    (r"^(The|the|A|a|An|an|This|this|That|that)$", "DET"),
    (r"^(I|You|He|She|It|We|They|you|he|she|it|we|they)$", "PRON"),
    (r".*ing$", "VERB"),
    (r".*ed$", "VERB"),
    (r".*es$", "VERB"),
    (r".*ould$", "VERB"),
    (r".*'s$", "NOUN"),
    (r".*s$", "NOUN"),
    (r"^-?[0-9]+(\.[0-9]+)?$", "NUM"),
    (r".*ly$", "ADV"),
    (r"^[A-Z].*$", "NOUN"),
    (r".*", "NOUN"),
]

METHOD_DESCRIPTIONS = {
    "Rule-Based": "Uses ordered hand-written regular-expression rules. It is transparent and requires no training data.",
    "Statistical": "A unigram tagger that assigns each word its most frequent training-corpus tag, with a default fallback.",
    "HMM": "A Hidden Markov Model finds the most likely tag sequence using Viterbi decoding.",
    "Transformation-Based": "A Brill tagger starts with unigram guesses and applies learned correction rules.",
}

MODELS = None
ACCURACIES = None
N_TRAIN = 0
N_TEST = 0


def ensure_nltk_data():
    required = [
        ("corpora/brown", "brown"),
        ("taggers/universal_tagset", "universal_tagset"),
    ]
    for path, pkg in required:
        try:
            nltk.data.find(path)
        except LookupError:
            nltk.download(pkg, quiet=True)


def tokenize(text):
    text = re.sub(r"([.,!?;:])", r" \1 ", text)
    return [t for t in text.strip().split() if t]


def accuracy_of(tagger, test_sents):
    try:
        return tagger.accuracy(test_sents)
    except AttributeError:
        return tagger.evaluate(test_sents)


def build_models():
    global MODELS, ACCURACIES, N_TRAIN, N_TEST
    if MODELS is not None:
        return

    ensure_nltk_data()

    from nltk.corpus import brown
    from nltk.tag import RegexpTagger, UnigramTagger, DefaultTagger
    from nltk.tag.hmm import HiddenMarkovModelTagger
    from nltk.tag.brill import Word, Pos
    from nltk.tag.brill_trainer import BrillTaggerTrainer
    from nltk.tbl.template import Template

    sents = list(brown.tagged_sents(categories="news", tagset="universal"))[:CORPUS_LIMIT]
    split = int(len(sents) * TRAIN_FRACTION)
    train_sents, test_sents = sents[:split], sents[split:]

    models = {"Rule-Based": RegexpTagger(RULE_PATTERNS)}

    default_tagger = DefaultTagger("NOUN")
    unigram_tagger = UnigramTagger(train_sents, backoff=default_tagger)
    models["Statistical"] = unigram_tagger
    models["HMM"] = HiddenMarkovModelTagger.train(train_sents)

    try:
        Template._cleartemplates()
    except Exception:
        pass

    templates = [
        Template(Pos([-1])),
        Template(Pos([1])),
        Template(Pos([-2, -1])),
        Template(Pos([1, 2])),
        Template(Word([-1])),
        Template(Word([1])),
        Template(Word([-1]), Pos([-1])),
    ]
    trainer = BrillTaggerTrainer(unigram_tagger, templates, trace=0)
    models["Transformation-Based"] = trainer.train(train_sents, max_rules=100)

    MODELS = models
    ACCURACIES = {
        name: round(accuracy_of(tagger, test_sents) * 100, 2)
        for name, tagger in models.items()
    }
    N_TRAIN = len(train_sents)
    N_TEST = len(test_sents)


def analyze_sentence(sentence):
    build_models()
    tokens = tokenize(sentence)
    results = {}

    for name, tagger in MODELS.items():
        results[name] = [
            {"word": word, "tag": tag or "UNK"}
            for word, tag in tagger.tag(tokens)
        ]

    rows = []
    for i, token in enumerate(tokens):
        tags = {name: results[name][i]["tag"] for name in MODELS}
        values = list(tags.values())
        agreement = len(set(values)) == 1
        rows.append({
            "index": i + 1,
            "word": token,
            "tags": tags,
            "agreement": agreement,
        })

    return {
        "tokens": tokens,
        "token_count": len(tokens),
        "results": results,
        "rows": rows,
    }


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/status")
def status():
    build_models()
    best = max(ACCURACIES, key=ACCURACIES.get)
    return jsonify({
        "accuracies": ACCURACIES,
        "train_sentences": N_TRAIN,
        "test_sentences": N_TEST,
        "best_model": best,
        "descriptions": METHOD_DESCRIPTIONS,
    })


@app.post("/api/analyze")
def analyze():
    data = request.get_json(silent=True) or {}
    sentence = (data.get("sentence") or "").strip()
    if not sentence:
        return jsonify({"error": "Please enter a sentence."}), 400
    return jsonify(analyze_sentence(sentence))


@app.post("/api/tag")
def tag():
    data = request.get_json(silent=True) or {}
    sentence = (data.get("sentence") or "").strip()
    method = data.get("method") or "HMM"

    if not sentence:
        return jsonify({"error": "Please enter a sentence."}), 400

    build_models()
    if method not in MODELS:
        return jsonify({"error": "Unknown tagger."}), 400

    tokens = tokenize(sentence)
    tagged = [
        {"word": word, "tag": tag or "UNK"}
        for word, tag in MODELS[method].tag(tokens)
    ]
    return jsonify({
        "method": method,
        "tokens": tagged,
        "accuracy": ACCURACIES[method],
        "description": METHOD_DESCRIPTIONS[method],
    })


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
