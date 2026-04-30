## Setup

1. Clone the repo
   git clone https://github.com/MahmoudBELAYEB/rag-chatbot.git

2. Create your environment
   cd backend
   python -m venv .venv
   source .venv/bin/activate   # Windows: .venv\Scripts\activate

3. Fill in your API key in .env
   GEMINI_API_KEY=your-key-here

4. Install dependencies
   pip install -r requirements.txt

5. Run the backend
   uvicorn main:app --reload --port 8000