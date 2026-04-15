# Submission

## Short Description
## What I Built
A prediction markets web application where users can browse markets, place bets on outcomes, and see live probability updates. Admins can create markets, resolve them with a winning outcome, or archive them to cancel and refund all bets.

## Design Choices
I went with a dark theme and purple accents because it felt clean and modern for a finance-style app. I used a card-based layout for the markets so everything is easy to scan at a glance. I also wanted the probability percentages to be the most visible thing on each card, since that's what users care about most when deciding where to place a bet.

For the admin features, I kept them contextual — they only show up when admin mode is on, so the interface stays clean for regular users.

## Challenges I Faced
Honestly, one of the bigger struggles was working with the database — setting up the schema, making sure relationships between users, markets, and bets were correct, and handling things like refunds when a market gets archived was trickier than I expected.

TypeScript was also a challenge since I'm not very experienced with it yet. There were quite a few moments where I was fighting with types and interfaces, especially when dealing with API responses and passing props between components. It slowed me down at first but I got more comfortable as the project went on.

Overall it was a really good learning experience and I'm happy with how it turned out!

## Demo Video
[Click here to watch the demo]
https://drive.google.com/file/d/1pstXU-QW0GIXxuT90jMRUeOmBWWDg6io/view?usp=sharing

## Images 
<img width="3200" height="1812" alt="Screenshot 2026-04-16 001948" src="https://github.com/user-attachments/assets/8abb8967-a596-42bf-a620-25a44078f959" />
<img width="3200" height="1822" alt="Screenshot 2026-04-16 002018" src="https://github.com/user-attachments/assets/a579e4fc-d755-4063-83d7-e506327dc193" />
<img width="3200" height="1822" alt="Screenshot 2026-04-16 014427" src="https://github.com/user-attachments/assets/67d37bbe-5b90-4066-be33-bf2c3dabb3a6" />
<img width="3198" height="1808" alt="Screenshot 2026-04-16 014440" src="https://github.com/user-attachments/assets/719f2452-38ac-4158-aeee-81bc9987e8be" />
<img width="3200" height="1816" alt="Screenshot 2026-04-16 014452" src="https://github.com/user-attachments/assets/9db1c959-59af-4cad-be03-bbebded5210c" />
<img width="3200" height="1826" alt="Screenshot 2026-04-16 014512" src="https://github.com/user-attachments/assets/34b931a8-6dd6-423f-9198-9f99fccefe5a" />
<img width="3200" height="1818" alt="Screenshot 2026-04-16 014527" src="https://github.com/user-attachments/assets/164ac541-b1d3-4f36-9452-b2fd68c7573d" />
<img width="3200" height="1816" alt="Screenshot 2026-04-16 015319" src="https://github.com/user-attachments/assets/b8a8ffb0-fb61-4573-a8b3-a37782cafe30" />
