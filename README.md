# 🧠 NEXUS: Wumpus Intelligence System

A **web-based intelligent agent simulation** inspired by the classic *Wumpus World* problem from Artificial Intelligence.
This system demonstrates how a **knowledge-based agent** uses **Propositional Logic, CNF conversion, and Resolution Refutation** to make safe decisions in an uncertain environment.

---

## 🚀 Overview

**NEXUS** is designed as an interactive AI simulation where an autonomous agent navigates a grid world containing hidden dangers such as pits and the Wumpus.

The agent does not have prior knowledge of the environment. Instead, it:

* Perceives clues (*breeze, stench, glitter*)
* Updates its **Knowledge Base (KB)**
* Applies **logical inference**
* Decides safe moves intelligently

---

## 🧩 Key Features

* 🎮 **Dynamic Grid Environment**

  * Adjustable grid size (3×3 to 8×8)
  * Randomized placement of pits and Wumpus

* 🧠 **Knowledge-Based Agent**

  * Maintains a structured **Belief Store (KB)**
  * Converts percepts into **CNF clauses**

* ⚙️ **Resolution-Based Inference**

  * Uses **Resolution Refutation** to prove safety
  * Avoids unsafe cells through logical deduction

* 📊 **Live Intelligence Dashboard**

  * Displays:

    * Knowledge Base clauses
    * Inference steps
    * Agent decisions
    * Active percepts

* 🔁 **Simulation Controls**

  * Step-by-step execution
  * Auto-run mode

* 🎯 **Path Planning**

  * Uses **BFS (Breadth-First Search)** over safe cells

---

## 🏗️ Project Structure

```
📁 nexus-wumpus-intelligence
│
├── index.html     # Main dashboard UI
├── style.css      # UI styling (dark theme with neon effects)
├── app.js         # Core logic engine and inference system
└── README.md      # Project documentation
```

---

## ⚙️ How It Works

1. **Environment Initialization**

   * Grid is generated with hidden hazards
   * Start position is always safe

2. **Perception Handling**

   * Agent senses:

     * Breeze → nearby pit
     * Stench → nearby Wumpus
     * Glitter → gold

3. **Knowledge Representation**

   * Percepts are translated into **Propositional Logic rules**
   * Converted into **Conjunctive Normal Form (CNF)**

4. **Inference Engine**

   * Uses **Resolution Algorithm** to:

     * Prove if a cell is safe
     * Detect possible dangers

5. **Decision Making**

   * Moves only to **logically safe cells**
   * Applies cautious exploration strategy

---

## 🖥️ Getting Started

### ▶️ Run Locally

1. Clone the repository:

```bash
git clone https://github.com/Hamza07-debug/nexus-wumpus-intelligence.git
```

2. Open the project folder

3. Run the application:

* Open `index.html` in your browser

---


## 🎓 Academic Context

This project is part of an **Artificial Intelligence coursework**, focusing on:

* Knowledge-Based Agents
* Propositional Logic
* CNF Conversion
* Logical Entailment
* Resolution Refutation

---

## 🔮 Future Improvements

* Web deployment (Vercel / Netlify)
* Enhanced UI animations
* Probabilistic reasoning (Bayesian approach)
* Multi-agent simulation
* Performance optimization of resolution engine

---

## 👨‍💻 Author

**Hamza Afzaal**
🎓 BS Computer Science
🏫 FAST-NUCES (Faisalabad Campus)
📌 Roll No: 24F-0698

---

## 📜 License

This project is for **educational purposes only**.
Feel free to use and modify with proper attribution.

---

## ⭐ Support

If you found this project helpful, consider giving it a ⭐ on GitHub!
