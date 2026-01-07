
import { GoogleGenAI, Type } from "@google/genai";
import { PGSLEngine } from "./cahEngine";

export class GeminiController {
  private ai: GoogleGenAI | null = null;
  private engine: PGSLEngine;

  constructor(engine: PGSLEngine) {
    this.engine = engine;
    if (process.env.API_KEY) {
      this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    }
  }

  isConfigured(): boolean {
    return !!this.ai;
  }

  async interpretAndExecute(prompt: string): Promise<string> {
    if (!this.ai) throw new Error("API Key not configured");

    const systemInstruction = `
      You are an architect of a Semantic Poly-Granular Sequence Lattice (PGSL).
      Your goal is to generate sequences of data to be ingested into a decentralized RDF hypergraph.
      
      Input: Natural language description of a structure.
      Output: A JSON list of sequences.
      
      CRITICAL: RECURSION & HYPERLINKS
      1. You can build deep nested structures.
      2. Use "$N" to refer to the URI/NodeID returned by step N.
      3. The engine uses HTTP URIs for IDs (e.g., http://host/atoms/123).
      
      Example 1: Input "Create ((0,0),(0,0))"
      Output:
      sequences: [
        ["0", "0"],       // Step 0: Returns URI_A
        ["$0", "$0"]      // Step 1: Returns URI_B
      ]

      Example 2: Input "Analyze 'mark'"
      sequences: [
        ["m", "a", "r", "k"] // Step 0: Returns URI_C
      ]
    `;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            sequences: {
              type: Type.ARRAY,
              items: {
                type: Type.ARRAY,
                items: { type: Type.STRING } 
              },
              description: "List of sequences. Use $index for recursive references."
            },
            explanation: { type: Type.STRING }
          },
          required: ["sequences"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    
    if (!result.sequences || result.sequences.length === 0) return "No sequences identified.";

    const stepResults: string[] = [];
    let count = 0;

    try {
      for (const seq of result.sequences) {
        // Resolve references
        const resolvedSeq = seq.map((item: string) => {
          if (item.startsWith('$')) {
            const index = parseInt(item.substring(1));
            if (!isNaN(index) && index >= 0 && index < stepResults.length) {
              return stepResults[index];
            }
          }
          return item;
        });

        const newId = this.engine.ingestSequence(resolvedSeq);
        stepResults.push(newId);
        count++;
      }
    } catch (e) {
      return `Error during execution: ${(e as Error).message}`;
    }

    return result.explanation || `Successfully constructed ${count} layers with Semantic URIs.`;
  }
}
