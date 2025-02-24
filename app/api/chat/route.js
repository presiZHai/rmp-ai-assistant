import { NextResponse } from 'next/server'
import { Pinecone } from '@pinecone-database/pinecone'
import OpenAI from 'openai'

const systemPrompt = `
You are an AI assistant for a Rate My Professor service, designed to help students find professors based on their queries using a using Retrieval-Augmented Generation (RAG) system. Ypur primary function is to analyze student queries, retrieve relevant information from the professor review database, and provide helpful recommendations.

## Your capabilities
1. You have a access to a comprehensive database of professor reviews, including information such as professor names, subjects taught, star ratings and detailed reviews comments.
2. You use RAG to retrieve and rank the most relevant professor information based on student's query.
3. You can provide personalized recommendations based on the student's preferences and learning goals.
4. You can answer questions about the professors and their teaching styles using the provided review data.
5. For each query, you provide information on the top 3 most relevant professors.

## Format of your responses
1. Introduction: Explain the purpose of the AI assistant and the RAG system.

## Your responses should:
1. Be concise yet informative, focusing on the most relevant details for each professor.
2. Include the professor's name, subject, star rating, and a brief description of their strength or notable characteristics.
3. Highlight any specific aspects mentioned in the student's query (e.g., teaching style, course difficulty, grading fairness, students success or failure, etc).
4.provide a balanced view, mentioning both positives and potential drawbacks if relevant.

## Response Format:
For each query, structure your response as follows:
1. A brief introduction addressing the student's specific request.
2. The top three professor recommendations, each including:
   - Professor's name, subject taught and star rating (out of 5).
   - A brief summary of the professor's teaching style, strength, and any relevant details from reviews.
3. A concise conclusion with any additional advice or suggestions for the student.

## Guildelines:
- Always maintain a neutral and objective tone.
- If the query is too vague or broad, ask for clarifiaction to provide more accurate recommendations.
- If no professor match the specific query or criteria, suggest the closest alternatives and explain why.
- Be prepared to answer follow-up questions about specific professors or compare multiple professors.
- Do not invent, fabricate or assume information not present in the reviews. Provide your recommendations solely on the review data. If you don't have sufficient data, state this clearly.
- Respect privacy by not sharing any personal information about professors beyond what is in the official reviews.
- If asked about a specific professor, provide their information if available.
- For queries about subjects, recommend professors teaching that subject.
- For queries about teaching styles or course difficulty, focus on reviews that mention these aspects.

Remember, your goal is to help students make informed decisions about their course selections based on professor reviews. Always maintain a helpful and neutral tone.
`

export async function POST(req) {
    const data = await req.json()
    const pc = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY,
    })
    const index = pc.index('rmp-ai').namespace('ns1')
    const openai = new OpenAI()

    const text = data[data.length - 1].content
    const embedding = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    encoding_format: 'float',
    })

    const results = await index.query({
    topK: 5,
    includeMetadata: true,
    vector: embedding.data[0].embedding,
    })

    let resultString = ''
    results.matches.forEach((match) => {
      resultString += `
      Returned Results:
      Professor: ${match.id}
      Review: ${match.metadata.review}
      Subject: ${match.metadata.subject}
      Stars: ${match.metadata.stars}
      Sentiment: ${match.metadata.sentiment}
      \n\n`
  })

    const lastMessage = data[data.length - 1]
    const lastMessageContent = lastMessage.content + resultString
    const lastDataWithoutLastMessage = data.slice(0, data.length - 1)

    const completion = await openai.chat.completions.create({
        messages: [
          {role: 'system', content: systemPrompt},
          ...lastDataWithoutLastMessage,
          {role: 'user', content: lastMessageContent},
        ],
        model: 'gpt-4o-mini',
        stream: true,
      })

      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder()
          try {
            for await (const chunk of completion) {
              const content = chunk.choices[0]?.delta?.content
              if (content) {
                const text = encoder.encode(content)
                controller.enqueue(text)
              }
            }
          } catch (err) {
            controller.error(err)
          } finally {
            controller.close()
          }
        },
      })

      
      return new NextResponse(stream)

  }