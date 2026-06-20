# First run in your terminal: pip install ddgs
from ddgs import DDGS

def web_search(query, max_results=3):
    """
    Performs a free web search using DuckDuckGo and returns structural text context.
    """
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
            if not results:
                return "No real-time web search results found."
            
            context_str = "Web Search Results:\n"
            for i, res in enumerate(results, 1):
                context_str += f"[{i}] Title: {res.get('title')}\n"
                context_str += f"    Source: {res.get('href')}\n"
                context_str += f"    Snippet: {res.get('body')}\n\n"
            return context_str
    except Exception as e:
        return f"Failed to fetch live search results: {str(e)}"