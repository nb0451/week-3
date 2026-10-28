# Projects

## Autonomous EV Charging Robot (group coursework, simulation)
I led design engineering and project management for a team of 6 on a simulated EV charging robot with an arm, LiDAR and computer vision. We identified 9 failure modes, with a mitigation for each. I chose the actuators and motors and worked with my teammates to fit them into the team's CAD.

## Adaptive Low-Power Temperature Monitor (Arduino, individual coursework)
I built an Arduino data logger that adjusts its sampling rate using an on-board DFT and the Nyquist criterion. I cut the sampling rate by 50% (from 1 Hz to about 0.5 Hz) on a slow signal, within an estimated 1.5 KB of the board's 2 KB of SRAM. I logged the data over serial and analysed it in Python. The code is on GitHub.

## Autonomous Digital Flight Simulator (personal project)
A flight simulator in Python, using object-oriented code and custom control loops for navigation and flight paths.

## Week 1 project: Ground Truth (AI evaluation)
I hand-labelled 30 news headlines into four categories (World, Sports, Business and Sci/Tech), had an AI model label the same 30 with two different prompts, and compared everything against the official AG News labels. My labels agreed with the official ones 80% of the time (Cohen's kappa 0.73). Business and Sci/Tech were confused most. I also showed that always answering World scores 80% accuracy on an imbalanced set but a kappa of 0.00, and that a TF-IDF classifier tested on its own training data scored 1.00 against 0.62 when tested honestly.

## Week 2 project: Newsroom Triage (deployed app)
I put a Python news classifier on GitHub with automated tests that run on every change, fixed its three failing tests, deployed it on Render, and added a feature that asks the model twice when it is unsure. Its accuracy on my 30 test headlines went from 20% to about 83% to 87% (25 or 26 of 30) once I found that the model's replies were being cut off by a token limit. The free hosting took 65 seconds to wake up after sitting idle.

## Week 3 project: this portfolio chat
This page has a chat that answers questions about me from my own notes. It is deployed on Vercel, and I am measuring how well its retrieval works.
