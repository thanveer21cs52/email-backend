const express = require("express");
const multer = require("multer");
const nodemailer = require("nodemailer");
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();
const app = express();
const PORT = 3001;
const { neon } = require("@neondatabase/serverless");
const client = neon(process.env.db_url);
const XLSX = require("xlsx");

app.use(express.json());
// "http://localhost:3000"||
app.use(cors({ origin: "https://email-frontend-one.vercel.app" }));

const storage = multer.memoryStorage();
const upload = multer({ storage });

app.post("/send-email", upload.array("attachments"), async (req, res) => {
  try {
    const { to, subject, message } = req.body;
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
app.post("/excel/send-email", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    console.log(file);
    const workbook = XLSX.read(file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const data = XLSX.utils.sheet_to_json(sheet);

    console.log("Parsed Excel Data:", data);

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.email_user,
        pass: process.env.email_pass,
      },
    });
    const senderdetails=[]
    for (const email of data) {
      try{
         await transporter.sendMail({
        from: `<${process.env.email_user}>`,
        to: email.email,
        subject: email?.subject||'default subject',
        text: email?.message||'default message',
      });
      senderdetails.push({...email,sended:true,from:process.env.email_user,filename:file.originalname})

      }
      catch(err){
        senderdetails.push({...email,sended:false})
      }
     
      await client`
      INSERT INTO sent_emails (sender, receiver, subject, message)
      VALUES (${process.env.email_user}, ${email.email}, ${email.subject}, ${email.message})
    `;
      await client`INSERT INTO email_list (sender, receiver, subject, message,filename)
      VALUES (${process.env.email_user}, ${email.email}, ${email.subject}, ${email.message},${file.originalname})
    `;
    }

    res.status(200).json({ message: "success",data:senderdetails });
  } catch (err) {
    console.error(err);
    ("Node Mailer");
    res.status(500).json({ error: "Failed to send email" });
  }
});
app.get("/gethistory", async (req, res) => {
  try {
    const data = await client.query("select * from sent_emails");
    res.send({
      message: "success",
      data: data,
    });
  } catch (err) {
    res.send({
      message: "failed",
    });
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});
