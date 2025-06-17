'use client';

import { useState, useEffect } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface UserProfile {
  sentiment: number; // -1 to 1
  hobbies: [number, number, number]; // [music, sports, social] 0-1
  conversationCount: number;
}

type ChatPhase = 'greeting' | 'caring' | 'matching' | 'free';

interface AIChatBoxProps {
  geminiApiKey: string;
}

export default function AIChatBox({ geminiApiKey }: AIChatBoxProps) {
  console.log("🔑 API KEY IS:", geminiApiKey);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatPhase, setChatPhase] = useState<ChatPhase>('greeting');
  const [userProfile, setUserProfile] = useState<UserProfile>({
    sentiment: 0,
    hobbies: [0, 0, 0],
    conversationCount: 0
  });

  // Initialize with AI greeting
  useEffect(() => {
    const initialMessage: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: 'Hello! I\'m your personal chat assistant. How are you feeling today? Is there anything you\'d like to share with me? 😊',
      timestamp: new Date()
    };
    setMessages([initialMessage]);
    console.log("💬 Initial message set");
  }, []);

  // Call Gemini API with debug info
  const callGeminiAPI = async (prompt: string, systemPrompt: string): Promise<string> => {
    console.log("🚀 callGeminiAPI called with:");
    console.log("📝 Prompt:", prompt);
    console.log("🎯 System Prompt:", systemPrompt);

    try {
      // Fix: Use English in fullPrompt
      const fullPrompt = `${systemPrompt}\n\nUser says: ${prompt}`;
      console.log("📋 Full prompt:", fullPrompt);

      // Fix: Use correct API endpoint (v1 instead of v1beta)
      const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
      console.log("🌐 API URL:", apiUrl);

      const requestBody = {
        contents: [
          {
            parts: [
              {
                text: fullPrompt
              }
            ]
          }
        ]
      };
      console.log("📦 Request body:", JSON.stringify(requestBody, null, 2));

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      console.log("📡 Response status:", response.status);
      console.log("📡 Response ok:", response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ API Error response:", errorText);
        throw new Error(`API request failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log("📄 Raw API response:", JSON.stringify(data, null, 2));

      const resultText = data.candidates[0]?.content?.parts[0]?.text;
      console.log("✅ Extracted text:", resultText);

      if (!resultText) {
        console.warn("⚠️ No text found in response");
        return 'Sorry, I could not generate a response.';
      }

      return resultText;
    } catch (error) {
      console.error('❌ Gemini API Error:', error);
      return 'Sorry, I encountered some technical issues. Please try again later.';
    }
  };

  // Call room matching API with debug info
  const callRoomMatchingAPI = async (sentiment: number, hobbies: [number, number, number]) => {
    console.log("🏠 callRoomMatchingAPI called with:");
    console.log("💭 Sentiment:", sentiment);
    console.log("🎯 Hobbies:", hobbies);

    // Check for zero vector before sending
    const vector = [sentiment, ...hobbies];
    const isZeroVector = vector.every(v => Math.abs(v) < 0.001);

    if (isZeroVector) {
      console.warn("⚠️ Zero vector detected, cannot perform matching");
      return null;
    }

    try {
      const requestBody = { sentiment, hobbies };
      console.log("📦 Room matching request:", requestBody);

      const response = await fetch('/api/room-matching', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      console.log("🏠 Room matching response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Room matching error response:", errorText);
        throw new Error('Room matching API failed');
      }

      const result = await response.json();
      console.log("✅ Room matching result:", result);
      return result;
    } catch (error) {
      console.error('❌ Room matching error:', error);
      return null;
    }
  };

  // Analyze user sentiment and preferences with full debug
  const analyzeUserInput = async (userInput: string): Promise<Partial<UserProfile>> => {
    console.log("🔍 ===== STARTING USER INPUT ANALYSIS =====");
    console.log("📝 Input to analyze:", userInput);

    const analysisPrompt = `
IMPORTANT: Return ONLY a valid JSON object, no markdown formatting, no backticks, no explanation text.

Analyze the user input and return this exact JSON structure:
{
  "sentiment": 0.5,
  "musicInterest": 0.3,
  "sportsInterest": 0.2,
  "socialInterest": 0.4
}

Where:
- sentiment: number from -1 to 1 (-1 most negative, 1 most positive)
- musicInterest: number from 0 to 1 (interest level in music)
- sportsInterest: number from 0 to 1 (interest level in sports)
- socialInterest: number from 0 to 1 (interest level in social activities)

User input: "${userInput}"

Return only the JSON object:`;

    console.log("📋 Analysis prompt:", analysisPrompt);

    try {
      console.log("🚀 Step 1: Calling Gemini API for analysis...");
      const result = await callGeminiAPI(analysisPrompt, 'You are a professional emotion and interest analyst. Return only valid JSON.');

      console.log("📄 Step 2: Raw API result:", result);
      console.log("📏 Step 3: Result length:", result.length);
      console.log("🔤 Step 4: Result type:", typeof result);

      console.log("🧹 Step 5: Cleaning result...");
      let cleanedResult = result.replace(/```json\s*|\s*```/g, '').trim();
      console.log("✨ Step 6: After removing markdown:", cleanedResult);

      // Additional cleaning - remove any non-JSON text
      const jsonMatch = cleanedResult.match(/\{[^}]*\}/);
      if (jsonMatch) {
        cleanedResult = jsonMatch[0];
        console.log("🎯 Step 7: Extracted JSON from match:", cleanedResult);
      } else {
        console.warn("⚠️ Step 7: No JSON object found in response");
      }

      console.log("🔄 Step 8: Attempting to parse JSON...");
      const analysis = JSON.parse(cleanedResult);

      console.log("🎉 Step 9: Successfully parsed analysis:", analysis);
      console.log("💭 Sentiment value:", analysis.sentiment);
      console.log("🎵 Music interest:", analysis.musicInterest);
      console.log("⚽ Sports interest:", analysis.sportsInterest);
      console.log("👥 Social interest:", analysis.socialInterest);

      const resultObj = {
        sentiment: typeof analysis.sentiment === 'number' ? analysis.sentiment : 0.1,
        hobbies: [
          typeof analysis.musicInterest === 'number' ? analysis.musicInterest : 0.1,
          typeof analysis.sportsInterest === 'number' ? analysis.sportsInterest : 0.1,
          typeof analysis.socialInterest === 'number' ? analysis.socialInterest : 0.1
        ] as [number, number, number]
      };

      console.log("📊 Step 10: Final result object:", resultObj);
      console.log("🔍 ===== ANALYSIS COMPLETED SUCCESSFULLY =====");

      return resultObj;

    } catch (error) {
      console.error("❌ ===== ANALYSIS ERROR =====");
      console.error("🔍 Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack
      });

      // Return small non-zero values to avoid zero vector
      const defaultResult = {
        sentiment: 0.1,
        hobbies: [0.1, 0.1, 0.1] as [number, number, number]
      };

      console.log("🔄 Returning default values:", defaultResult);
      console.log("❌ ===== ANALYSIS COMPLETED WITH ERROR =====");
      return defaultResult;
    }
  };

  // Get system prompts for different phases
  const getSystemPrompt = (phase: ChatPhase): string => {
    const prompts = {
      greeting: 'You are a warm and caring chat assistant. Focus on asking about the user\'s mood and feelings, showing genuine care. Keep the conversation natural and flowing.',
      caring: 'Continue caring about the user\'s emotional state, you can ask about their interests, hobbies, favorite activities, etc. Show empathy and support. Gradually understand user preferences.',
      matching: 'Based on previous conversations, prepare to recommend suitable rooms for the user. Ask if they need recommendations, or make recommendations directly.',
      free: 'Now you can chat freely and answer various user questions. Maintain a friendly and helpful attitude.',
    };

    const prompt = prompts[phase] || 'You are a friendly chat assistant.';
    console.log(`🎯 System prompt for ${phase}:`, prompt);
    return prompt;
  };

  // Check if room recommendation is needed
  const shouldRecommendRoom = (userInput: string): boolean => {
    const recommendKeywords = ['recommend', 'suggestion', 'where', 'room', 'what room', 'where should', 'advice'];
    const shouldRecommend = recommendKeywords.some(keyword => userInput.toLowerCase().includes(keyword.toLowerCase()));
    console.log(`🤔 Should recommend room for "${userInput}"?`, shouldRecommend);
    return shouldRecommend;
  };

  // Handle room recommendation
  const handleRoomRecommendation = async (): Promise<string> => {
    console.log("🏠 ===== STARTING ROOM RECOMMENDATION =====");
    console.log("👤 Current user profile:", userProfile);

    const roomResult = await callRoomMatchingAPI(userProfile.sentiment, userProfile.hobbies);

    if (roomResult) {
      const { roomName, roomType, description, currentUsers, maxCapacity, matchScore } = roomResult;
      const recommendation = `
Based on our conversation, I recommend this room for you:

🏠 **${roomName}** (${roomType})
📝 ${description}
👥 Current users: ${currentUsers}/${maxCapacity}
🎯 Match score: ${(matchScore * 100).toFixed(1)}%

This room suits your current mood and interests perfectly! Would you like to check it out?
      `.trim();

      console.log("✅ Room recommendation generated:", recommendation);
      console.log("🏠 ===== RECOMMENDATION COMPLETED =====");
      return recommendation;
    } else {
      const fallback = 'Sorry, I couldn\'t find a particularly suitable room right now. But we can continue chatting, or you can try again later!';
      console.log("⚠️ No room result, using fallback:", fallback);
      console.log("🏠 ===== RECOMMENDATION COMPLETED WITH FALLBACK =====");
      return fallback;
    }
  };

  // Send message with full debug
  const sendMessage = async () => {
    if (!input.trim() || isLoading) {
      console.log("⏹️ Send message blocked - empty input or loading");
      return;
    }

    console.log("📨 ===== STARTING SEND MESSAGE =====");
    console.log("💬 User input:", input);
    console.log("📊 Current user profile:", userProfile);
    console.log("🎭 Current chat phase:", chatPhase);

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setIsLoading(true);

    try {
      // Analyze user input
      console.log("🔍 Starting user input analysis...");
      const analysis = await analyzeUserInput(currentInput);
      console.log("📊 Analysis result:", analysis);

      // Update user profile
      const newProfile = {
        sentiment: (userProfile.sentiment + (analysis.sentiment || 0)) / 2,
        hobbies: [
          (userProfile.hobbies[0] + (analysis.hobbies?.[0] || 0)) / 2,
          (userProfile.hobbies[1] + (analysis.hobbies?.[1] || 0)) / 2,
          (userProfile.hobbies[2] + (analysis.hobbies?.[2] || 0)) / 2,
        ] as [number, number, number],
        conversationCount: userProfile.conversationCount + 1
      };

      console.log("📈 Updated user profile:", newProfile);
      setUserProfile(newProfile);

      // Check if room recommendation is needed
      const needsRecommendation = shouldRecommendRoom(currentInput) ||
        (userProfile.conversationCount >= 2 && chatPhase === 'caring');

      console.log("🤔 Needs recommendation?", needsRecommendation);
      console.log("📊 Conversation count:", userProfile.conversationCount);

      let aiResponse: string;

      if (needsRecommendation && chatPhase !== 'free') {
        console.log("🏠 Entering recommendation flow...");
        setChatPhase('matching');
        aiResponse = await handleRoomRecommendation();
        setChatPhase('free');
      } else {
        console.log("💬 Normal conversation flow...");
        const systemPrompt = getSystemPrompt(chatPhase);
        aiResponse = await callGeminiAPI(currentInput, systemPrompt);

        // Phase transition logic
        if (chatPhase === 'greeting' && userProfile.conversationCount >= 1) {
          console.log("🔄 Transitioning from greeting to caring");
          setChatPhase('caring');
        } else if (chatPhase === 'caring' && userProfile.conversationCount >= 3) {
          console.log("🔄 Transitioning from caring to matching");
          setChatPhase('matching');
        }
      }

      console.log("🤖 AI response:", aiResponse);

      // Add AI reply
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);
      console.log("✅ ===== SEND MESSAGE COMPLETED =====");

    } catch (error) {
      console.error("❌ ===== SEND MESSAGE ERROR =====");
      console.error('Error in sendMessage:', error);

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered some issues. Please try again later.',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Enter key to send
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-lg">
      {/* Chat header */}
      <div className="bg-blue-500 text-white p-4 rounded-t-lg">
        <h3 className="font-semibold">AI Chat Assistant</h3>
        <div className="text-xs opacity-80">
          Phase: {chatPhase} | Conversations: {userProfile.conversationCount} rounds
        </div>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] px-4 py-2 rounded-lg ${
                msg.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
              <div className="text-xs opacity-70 mt-1">
                {msg.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}

        {/* Loading state */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-800 px-4 py-2 rounded-lg">
              <div className="text-sm">AI is thinking...</div>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm resize-none"
            placeholder="Type your message..."
            rows={2}
            disabled={isLoading}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="bg-blue-500 text-white px-6 py-2 rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>

        {/* User profile display (for debugging) */}
        <div className="mt-2 text-xs text-gray-500">
          Sentiment: {userProfile.sentiment.toFixed(2)} |
          Interests: [{userProfile.hobbies.map(h => h.toFixed(2)).join(', ')}]
        </div>
      </div>
    </div>
  );
}