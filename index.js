const express = require("express");
const multer = require("multer");
const nodemailer = require("nodemailer");
const cors = require("cors");
const dotenv=require('dotenv')
dotenv.config()
const app = express();
const PORT = 3001;
const { neon } = require("@neondatabase/serverless");
const client =neon(process.env.db_url)


app.use(express.json());
app.use(cors({ origin: "http://localhost:3000" }));

const storage = multer.memoryStorage();
const upload = multer({ storage });


app.post("/send-email", upload.array("attachments"), async (req, res) => {
  try {
    const {  to, subject, message } = req.body;
    const files = req.files;

  
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.email_user,
        pass: process.env.email_pass,
      },
    });


    const attachments = files.map((file) => ({
      filename: file.originalname,
      content: file.buffer,
    }));

  
    await transporter.sendMail({
    from: `"node mailer Message" <${process.env.email_user}>`,
      to,
      subject,
      text: message,
      attachments,
    });
    await client`
      INSERT INTO sent_emails (sender, receiver, subject, message)
      VALUES (${process.env.email_user}, ${to}, ${subject}, ${message})
    `;



    res.status(200).json({ message: "success" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send email" });
  }
});


app.listen(process.env.PORT, () => {
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});
