from dotenv import load_dotenv
load_dotenv()
from pinecone import Pinecone, ServerlessSpec
from openai import OpenAI
import os
import json
import spacy
import string
from spacy.lang.en.stop_words import STOP_WORDS
from textblob import TextBlob

# Load spaCy model
nlp = spacy.load('en_core_web_sm')

# Text preprocessing function using spaCy
def preprocess_text(text):
    doc = nlp(text.lower())  # Process the text with spaCy
    tokens = [token.lemma_ for token in doc if token.text not in STOP_WORDS and token.text not in string.punctuation]
    processed_text = ' '.join(tokens)
    return processed_text

# Sentiment analysis function using TextBlob
def analyze_sentiment(text):
    blob = TextBlob(text)
    sentiment = blob.sentiment.polarity
    if sentiment >= 0.05:
        return 'positive'
    elif sentiment <= -0.05:
        return 'negative'
    else:
        return 'neutral'

# Initialize Pinecone
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))

# Create a Pinecone index
pc.create_index(
    name="rmp-ai",
    dimension=1536,
    metric="cosine",
    spec=ServerlessSpec(cloud="aws", region="us-east-1"),
)

# Load the review data
with open("reviews.json") as file:
    data = json.load(file)

# Initialize OpenAI client
client = OpenAI()

# Create embeddings for each review
processed_data = []

for review in data:
    processed_review = preprocess_text(review['review'])
    sentiment = analyze_sentiment(review['review'])

    response = client.embeddings.create(
        input=processed_review, model="text-embedding-ada-002"
    )
    embedding = response.data[0].embedding
    processed_data.append(
        {
            "values": embedding,
            "id": review["professor"],
            "metadata": {
                "review": review["review"],
                "subject": review["subject"],
                "stars": review["stars"],
                "processed_review": processed_review,
                "sentiment": sentiment
            }
        }
    )

# Insert the embeddings into the Pinecone index
index = pc.Index("rmp-ai")
upsert_response = index.upsert(
    vectors=processed_data,
    namespace="ns1",
)
print(f"Upserted count: {upsert_response['upserted_count']}")

# Print index statistics
print(index.describe_index_stats())