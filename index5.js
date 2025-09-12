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
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

app.use(express.json());
// "http://localhost:3000"||https://email-frontend-one.vercel.app"
app.use(cors({ origin: "http://localhost:3000" }));

const storage = multer.memoryStorage();
const upload = multer({ storage });


(async () => {
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS unread_emails (
        id TEXT PRIMARY KEY,
        subject TEXT,
        sender TEXT,
        receiver TEXT,
        received_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✅ Table 'unread_emails' with sender/receiver is ready!");
  } catch (err) {
    console.error("❌ Error creating table:", err);
  }
   try {
    await client.query(`
     CREATE TABLE IF NOT EXISTS last_seen_count (
  id SERIAL PRIMARY KEY,
  last_count INT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);
    `);
    console.log("✅ Table 'unread_stats' created!");
  } catch (err) {
    console.error("❌ Error creating unread_stats table:", err);
  }


})()

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
    const data = await client.query("SELECT * FROM sent_emails ORDER BY created_at DESC LIMIT 10");
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

// const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
// const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
// const { client_secret, client_id, redirect_uris } = credentials.web;

// const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])
const oAuth2Client = new google.auth.OAuth2(process.env.client_id, process.env.client_secret, process.env.redirect_uris);

oAuth2Client.setCredentials({
  refresh_token: process.env.refresh_token,
});
async function getAuthorizedClient() {
  const { credentials } = await oAuth2Client.refreshAccessToken();
  oAuth2Client.setCredentials(credentials);
  return oAuth2Client;
}



// app.get('/auth-url', (req, res) => {
//   const authUrl = oAuth2Client.generateAuthUrl({
//     access_type: 'offline',
//     scope: ['https://www.googleapis.com/auth/gmail.readonly'],
//   });
// //   res.json({ url: authUrl });
//  res.redirect(authUrl)
// });


// app.get('/oauth2callback', async (req, res) => {
//   const code = req.query.code;
//   if (!code) return res.status(400).send('No code found in query.');

//   try {
//     const { tokens } = await oAuth2Client.getToken(code);
//     oAuth2Client.setCredentials(tokens);
//     fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
//     res.redirect('http://localhost:3000/')
    
//   } catch (error) {
//     console.error(error);
//     res.status(500).send({
//         message:'login failed'
//     });
//   }
// });
// app.get('/logout', async (req, res) => {
//   try {
//     if (fs.existsSync(TOKEN_PATH)) {
  
//       const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));

    
//       await oAuth2Client.revokeToken(token.access_token);

 
//       fs.unlinkSync(TOKEN_PATH);
//       console.log('✅ Token revoked and deleted!');
//     }

//     res.send({
//         message:'successfully logout'
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).send({
//         message:'logout failed'
//     });
//   }
// });
app.get('/read-mails', async (req, res) => {
  try {
    // 1️⃣ Get current count of unread_emails
    const countResult = await client.query('SELECT COUNT(*) FROM unread_emails');
    const totalCount = parseInt(countResult[0].count, 10);

    // 2️⃣ Check if last_seen_count table has data
    const lastSeenRes = await client.query('SELECT id, last_count FROM last_seen_count ORDER BY id DESC LIMIT 1');

    if (lastSeenRes.length) {
   
      await client.query(
        'UPDATE last_seen_count SET last_count = $1, updated_at = NOW() WHERE id = $2',
        [totalCount, lastSeenRes[0].id]
      );
    } else {
 
      await client.query('INSERT INTO last_seen_count (last_count) VALUES ($1)', [totalCount]);
    }


    const authClient = await getAuthorizedClient();
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread',
      maxResults: 10,
    });

    if (!listRes.data.messages) {
      return res.json({ messages: [] });
    }

    const messages = [];

    for (const msg of listRes.data.messages) {
      const msgRes = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
      });

      const headers = msgRes.data.payload.headers;
      const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
      const from = headers.find(h => h.name === 'From')?.value || '(Unknown)';
      const to = headers.find(h => h.name === 'To')?.value || null;
      const date = headers.find(h => h.name === 'Date')?.value;

      const row = {
        id: msg.id,
        subject,
        sender: from,
        receiver: to,
        received_at: new Date(date),
      };

      messages.push(row);

      // Insert into DB
      await client.query(
        `INSERT INTO unread_emails (id, subject, sender, receiver, received_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [row.id, row.subject, row.sender, row.receiver, row.received_at]
      );
    }

    res.json({ message: 'success', inserted: messages.length });

  } catch (error) {
    console.error(error);
    res.status(500).send('Error reading mails');
  }
});


app.get('/getmails', async (req, res) => {
  try {

    const lastSeenRes = await client.query('SELECT last_count FROM last_seen_count ORDER BY id DESC LIMIT 1');
    const lastCount = lastSeenRes.length ? lastSeenRes[0].last_count : 0;

  
    const result = await client.query(
      'SELECT * FROM unread_emails ORDER BY received_at ASC OFFSET $1',
      [lastCount]
    );

    res.json({
      message: 'success',
      newCount: result.length,
      data: result,
    });

  } catch (error) {
    console.error(error);
    res.status(500).send('Error getting mails');
  }
});




app.listen(process.env.PORT, () => {
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});
