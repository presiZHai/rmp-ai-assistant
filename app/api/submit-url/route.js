import { NextResponse } from 'next/server'
import { Pinecone } from '@pinecone-database/pinecone'
import OpenAI from 'openai'
import fetch from 'node-fetch'
import cheerio from 'cheerio'

export async function POST(req) {
    const { url } = await req.json()

    if (!url || !url.includes('ratemyprofessors.com')) {
        return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
    }

    // Fetch the webpage
    const response = await fetch(url)
    const html = await response.text()

    // Use Cheerio to parse the HTML and extract data
    const $ = cheerio.load(html)
    const professorName = $('h1').text().trim()
    const reviews = []
    $('.ReviewText__StyledReviewText-sc-1g6gtl7-0').each((i, el) => {
        reviews.push($(el).text().trim())
    })
    const subjects = $('.NameTitle__Title-dowf0z-1').text().trim()
    const stars = $('.RatingValue__Numerator-qw8sqy-2').text().trim()

    if (!professorName || reviews.length === 0) {
        return NextResponse.json({ error: 'Failed to scrape data' }, { status: 500 })
    }

    // Create embeddings using OpenAI API
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    })

    const embeddings = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: reviews.join('\n'),
    })

    const pc = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY,
    })

    const index = pc.index('rmp-ai').namespace('ns1')

    const processedData = {
        values: embeddings.data[0].embedding,
        id: professorName,
        metadata: {
            review: reviews.join(' '),
            subject: subjects,
            stars: stars,
        },
    }

    // Upsert the data into Pinecone
    const upsertResponse = await index.upsert({
        vectors: [processedData],
    })

    return NextResponse.json({ upsertedCount: upsertResponse.upserted_count })
}
