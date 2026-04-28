"""
Example: LangChain research agent using Mnemosyne as its persistent memory.

Prerequisites:
  pip install mnemosyne-memory langchain langchain-openai
  export OPENAI_API_KEY=sk-...
  export MNEMOSYNE_API_URL=http://localhost:3000
  export MNEMOSYNE_ENS=research-agent.mnemosyne.eth

  Start the Mnemosyne API first:
  cd ../packages/api && pnpm start
"""

import os
from langchain_openai import ChatOpenAI
from langchain.chains import ConversationChain
from langchain.prompts import PromptTemplate
from mnemosyne import MnemosyneMemory


PROMPT = PromptTemplate(
    input_variables=["mnemosyne_memory", "history", "input"],
    template=(
        "You are a research agent with decentralized persistent memory.\n\n"
        "{mnemosyne_memory}\n\n"
        "Conversation history:\n{history}\n\n"
        "Human: {input}\n"
        "Agent:"
    ),
)


def main() -> None:
    memory = MnemosyneMemory(
        api_url=os.getenv("MNEMOSYNE_API_URL", "http://localhost:3000"),
        submitted_by=os.getenv("MNEMOSYNE_ENS", "research-agent.mnemosyne.eth"),
        top_k=5,
        similarity_threshold=0.5,
        domain="factual",
    )

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

    chain = ConversationChain(
        llm=llm,
        memory=memory,
        prompt=PROMPT,
        verbose=True,
    )

    # First turn — agent learns and stores a fact
    print(chain.predict(input="The Ethereum merge happened on September 15, 2022. Remember that."))

    # Second turn — agent recalls from Mnemosyne (even across restarts)
    print(chain.predict(input="When did Ethereum switch to proof of stake?"))


if __name__ == "__main__":
    main()
