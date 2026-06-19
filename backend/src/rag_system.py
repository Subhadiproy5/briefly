# from google import genai
from openai import OpenAI
import os

class RAGSystem:
    # def __init__(self, api_key, model_name='gemini-2.5-flash'):
    #     self.client = genai.Client(api_key=api_key)
    #     self.model_name = model_name
    def __init__(self, api_key, model_name="openai/gpt-oss-120b:free"):

        self.client = OpenAI(
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1"
        )

        self.model_name = model_name

        # Context window to maintain conversation history for RAG
        self.conversation_history = []
    
    def add_to_context(self, role, content):
        """Add message to conversation context"""
        self.conversation_history.append({
            'role': role,
            'content': content
        })
    
    def clear_context(self):
        """Clear conversation context"""
        self.conversation_history = []
    
    def generate_response_with_rag(self, user_message, context_messages=None):
        """
        Generate response using RAG with conversation context
        context_messages: list of previous messages to provide context
        """
        # Build messages for the API
        messages = []
        
        # Add provided context if available
        if context_messages:
            for msg in context_messages:
                messages.append({
                    'role': msg.get('role', 'user'),
                    'content': msg.get('content', '')
                })
        
        # Add current message
        messages.append({
            'role': 'user',
            'content': user_message
        })
        
        try:
            # Create the full prompt with context
            full_prompt = self._build_prompt_with_context(messages)
            
            # Generate response
            # response = self.client.models.generate_content(
            #     model=self.model_name,
            #     contents=full_prompt
            # )
            
            # return response.text
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {
                        "role": "user",
                        "content": full_prompt
                    }
                ]
            )
            return response.choices[0].message.content
    
        except Exception as e:
            raise Exception(f"Error generating response: {str(e)}")
    
    def _build_prompt_with_context(self, messages):
        """Build a prompt that includes conversation context for better RAG"""
        context_text = "Consider the following conversation history:\\n\\n"
        
        for msg in messages[:-1]:  # All messages except the current one
            role = "User" if msg['role'] == 'user' else "Assistant"
            context_text += f"{role}: {msg['content']}\\n\\n"
        
        current_message = messages[-1]['content']
        
        prompt = f"""{context_text}
Based on the above conversation, please answer the following:

User: {current_message}

Please provide a helpful and coherent response that maintains context with the conversation history."""
        
        return prompt
