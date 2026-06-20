from openai import OpenAI
import os
import datetime
from utils.search_tool import web_search

class RAGSystem:
    def __init__(self, api_key, model_name="openai/gpt-oss-120b:free"):
        self.client = OpenAI(
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1"
        )
        self.model_name = model_name
        self.conversation_history = []
    
    def _needs_web_search(self, user_message):
        """
        Forced keyword interception combined with time-aware LLM evaluation.
        """
        lowered = user_message.lower()
        # Rule 1: Force internet search instantly if modern temporal phrases are used
        force_keywords = ['now', 'current', 'latest', 'yesterday', 'today', 'ruling party', 'election', 'live', 'update', 'who is']
        if any(kw in lowered for kw in force_keywords):
            return True

        # Rule 2: Fall back to LLM evaluation if keywords miss it
        current_year = datetime.datetime.now().year
        router_prompt = f"""You are a query router. The current year is {current_year}. Your static knowledge base ends in late 2024.
Determine if answering the user's input accurately requires looking up new real-time information or updates after your 2024 cutoff.

User Input: "{user_message}"

Respond with exactly one word: "YES" or "NO"."""
        try:
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=[{"role": "user", "content": router_prompt}],
                temperature=0.0
            )
            decision = response.choices[0].message.content.strip().upper()
            return "YES" in decision[:5]
        except Exception:
            return False

    def generate_response_with_rag(self, user_message, context_messages=None):
        messages = []
        if context_messages:
            for msg in context_messages:
                messages.append({
                    'role': msg.get('role', 'user'),
                    'content': msg.get('content', '')
                })

        is_realtime_needed = self._needs_web_search(user_message)
        
        if is_realtime_needed:
            search_context = web_search(user_message)
            final_user_content = f"""{search_context}
---------------------
Using the real-time search data above, please answer the user's prompt thoughtfully.

User Question: {user_message}"""
        else:
            final_user_content = user_message

        messages.append({
            'role': 'user',
            'content': final_user_content
        })
        
        try:
            full_prompt = self._build_prompt_with_context(messages)
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=[{"role": "user", "content": full_prompt}]
            )
            return response.choices[0].message.content
        except Exception as e:
            raise Exception(f"Error generating response: {str(e)}")
    
    def _build_prompt_with_context(self, messages):
        context_text = "Consider the following conversation history:\n\n"
        for msg in messages[:-1]:
            role = "User" if msg['role'] == 'user' else "Assistant"
            context_text += f"{role}: {msg['content']}\n\n"
        current_message = messages[-1]['content']
        return f"{context_text}Based on the context, answer the following:\n\n{current_message}"