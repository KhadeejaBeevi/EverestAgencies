import React, { useEffect, useRef, useState } from "react";
import Banner from "./components/Banner/Banner.jsx";
import {
  Bot,
  Send,
  X,
  Minimize2,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { apiFetch } from "./api/apiClient";

const AIChatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [loading, setLoading] = useState(false);

  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hello 👋\nI’m your AI Assistant.\nHow can I help you today?",
    },
  ]);

  const [input, setInput] = useState("");

  const messagesEndRef = useRef(null);



  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);



  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = {
      role: "user",
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);

    const currentInput = input;
    setInput("");
    setLoading(true);

    try {
   

      const response = await apiFetch(
        "/serverphp/chat.php",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: currentInput,
          }),
        }
      );

      const data = await response.json();

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            data.reply ||
            "Sorry, I couldn't understand.",
        },
      ]);
    } catch (error) {
      console.error(error);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Server error. Please try again.",
        },
      ]);
    }

    setLoading(false);
  };


  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      sendMessage();
    }
  };

  return (
    <>
            <Banner />

      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="
            fixed
            bottom-6
            right-6
            z-50
            bg-blue-600
            hover:bg-blue-700
            text-white
            p-4
            rounded-full
            shadow-2xl
            transition-all
            duration-300
          "
        >
          <MessageCircle size={28} />
        </button>
      )}

    
      {isOpen && (
        <div
          className="
            fixed
            bottom-6
            right-6
            z-50
            w-[380px]
            h-[620px]
            bg-white
            rounded-3xl
            shadow-2xl
            border
            border-gray-200
            overflow-hidden
            flex
            flex-col
          "
        >
         

          <div
            className="
              bg-gradient-to-r
              from-blue-600
              to-indigo-600
              text-white
              px-5
              py-4
              flex
              items-center
              justify-between
            "
          >
            <div className="flex items-center gap-3">
              <div
                className="
                  bg-white/20
                  p-2
                  rounded-full
                "
              >
                <Bot size={22} />
              </div>

              <div>
                <h2 className="font-semibold text-lg">
                  AI Assistant
                </h2>

                <div className="flex items-center gap-1 text-sm opacity-90">
                  <Sparkles size={14} />
                  Online
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setIsMinimized(!isMinimized)
                }
                className="
                  hover:bg-white/20
                  p-2
                  rounded-lg
                "
              >
                <Minimize2 size={18} />
              </button>

              <button
                onClick={() => setIsOpen(false)}
                className="
                  hover:bg-white/20
                  p-2
                  rounded-lg
                "
              >
                <X size={18} />
              </button>
            </div>
          </div>

      

          {!isMinimized && (
            <>
              <div
                className="
                  flex-1
                  overflow-y-auto
                  bg-gray-50
                  px-4
                  py-5
                  space-y-4
                "
              >
                {messages.map((msg, index) => (
                  <div
                    key={index}
                    className={`
                      flex
                      ${
                        msg.role === "user"
                          ? "justify-end"
                          : "justify-start"
                      }
                    `}
                  >
                    <div
                      className={`
                        max-w-[85%]
                        px-4
                        py-3
                        rounded-2xl
                        whitespace-pre-wrap
                        text-sm
                        shadow-sm
                        ${
                          msg.role === "user"
                            ? `
                              bg-blue-600
                              text-white
                              rounded-br-md
                            `
                            : `
                              bg-white
                              text-gray-800
                              border
                              border-gray-200
                              rounded-bl-md
                            `
                        }
                      `}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}

             

                {loading && (
                  <div className="flex justify-start">
                    <div
                      className="
                        bg-white
                        border
                        border-gray-200
                        rounded-2xl
                        rounded-bl-md
                        px-4
                        py-3
                        shadow-sm
                      "
                    >
                      <div className="flex gap-1">
                        <div
                          className="
                            w-2
                            h-2
                            bg-gray-400
                            rounded-full
                            animate-bounce
                          "
                        />

                        <div
                          className="
                            w-2
                            h-2
                            bg-gray-400
                            rounded-full
                            animate-bounce
                            delay-150
                          "
                        />

                        <div
                          className="
                            w-2
                            h-2
                            bg-gray-400
                            rounded-full
                            animate-bounce
                            delay-300
                          "
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>


              <div
                className="
                  border-t
                  border-gray-200
                  bg-white
                  p-4
                "
              >
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    placeholder="Type your message..."
                    value={input}
                    onChange={(e) =>
                      setInput(e.target.value)
                    }
                    onKeyDown={handleKeyDown}
                    className="
                      flex-1
                      border
                      border-gray-300
                      rounded-xl
                      px-4
                      py-3
                      outline-none
                      focus:ring-2
                      focus:ring-blue-500
                      focus:border-blue-500
                    "
                  />

                  <button
                    onClick={sendMessage}
                    disabled={loading}
                    className="
                      bg-blue-600
                      hover:bg-blue-700
                      disabled:opacity-50
                      text-white
                      p-3
                      rounded-xl
                      transition-all
                    "
                  >
                    <Send size={20} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
};

export default AIChatbot;