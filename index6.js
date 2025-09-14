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
app.use(cors({ origin: "https://email-frontend-one.vercel.app" }));

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
        console.log( listRes.data.nextPageToken)

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

app.get('/allmails', async (req, res) => {
  try {
    // const lastSeenRes = await client.query('SELECT id, last_count FROM last_seen_count ORDER BY id DESC LIMIT 1');

    // if (lastSeenRes.length) {
   
    //   await client.query(
    //     'UPDATE last_seen_count SET last_count = $1, updated_at = NOW() WHERE id = $2',
    //     [totalCount, lastSeenRes[0].id]
    //   );
    // } else {
 
    //   await client.query('INSERT INTO last_seen_count (last_count) VALUES ($1)', [totalCount]);
    // }


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
    console.log( fullMessage.data.historyId)

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



const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

/**
 * ✅ Fetch message IDs in pages (no payload, just IDs)
 */
async function fetchMessageIds(query, maxResults, pageToken = null) {
  const res = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults,
    pageToken,
  });
  return res.data;
}

/**
 * ✅ Fetch full message details for given message ID
 */
async function fetchMessageDetail(id) {
  const res = await gmail.users.messages.get({
    userId: "me",
    id,
    format: "metadata",
    metadataHeaders: ["Subject", "From", "To", "Date"],
  });

  const headers = res.data.payload.headers.reduce((acc, h) => {
    acc[h.name] = h.value;
    return acc;
  }, {});

  return {
    id: res.data.id,
    threadId: res.data.threadId,
    subject: headers.Subject || "(no subject)",
    sender: headers.From || "",
    receiver: headers.To || "",
    received_at: headers.Date || new Date().toISOString(),
  };
}

/**
 * ✅ Insert mini-batch (100 rows max)
 */
async function insertMessagesBatch(messages) {
  const chunkSize = 100;
  for (let i = 0; i < messages.length; i += chunkSize) {
    const chunk = messages.slice(i, i + chunkSize);
    const values = [];
    const placeholders = [];

    chunk.forEach((m, idx) => {
      const base = idx * 5;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`
      );
      values.push(m.id, m.subject, m.sender, m.receiver, m.received_at);
    });

    const query = `
      INSERT INTO gmail_messages (id, subject, sender, receiver, received_at)
      VALUES ${placeholders.join(", ")}
      ON CONFLICT (id) DO NOTHING
    `;

    let retries = 3;
    while (retries > 0) {
      try {
        await client.query(query, values);
        break;
      } catch (err) {
        console.error("⚠️ Insert failed, retrying:", err.message);
        retries--;
        await delay(300);
      }
    }
    await delay(50); // pacing to avoid Neon timeout
  }
}

/**
 * ✅ Full Inbox Sync (from Day 1)
 */
app.get("/sync-all", async (req, res) => {
  try {
    let pageToken = null;
    let allMessages = [];

    do {
      const data = await fetchMessageIds("in:inbox", 500, pageToken);
      if (data.messages) allMessages.push(...data.messages);
      pageToken = data.nextPageToken;
      await delay(200); // Gmail quota friendly
    } while (pageToken);

    console.log(`📥 Found ${allMessages.length} inbox emails`);

    const buffer = [];
    for (let i = 0; i < allMessages.length; i++) {
      const msg = await fetchMessageDetail(allMessages[i].id);
      buffer.push(msg);

      if (buffer.length >= 500) {
        await insertMessagesBatch(buffer);
        buffer.length = 0;
      }

      if (i % 100 === 0) await delay(50);
    }

    if (buffer.length > 0) await insertMessagesBatch(buffer);

    // ✅ Save latest historyId for delta sync
    const profile = await gmail.users.getProfile({ userId: "me" });
    await client.query(
      `INSERT INTO gmail_sync_state (id, history_id) 
       VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET history_id = $1`,
      [profile.data.historyId]
    );

    res.json({ message: "✅ Full inbox sync completed" });
  } catch (err) {
    console.error("❌ Full sync failed:", err);
    res.status(500).json({ message: "Full sync failed", error: err.message });
  }
});

/**
 * ✅ Delta Sync (only new emails)
 */
app.get("/sync-delta", async (req, res) => {
  try {
    // 1️⃣ Get last history ID
    const state = await client.query(
      "SELECT history_id FROM gmail_sync_state WHERE id = 1"
    );
    const lastHistoryId = state[0]?.history_id;

    if (!lastHistoryId) {
      return res.status(400).json({
        message: "No history ID found. Run /sync-all first.",
      });
    }

    // 2️⃣ Fetch new messages via Gmail history API
    const history = await gmail.users.history.list({
      userId: "me",
      startHistoryId: lastHistoryId,
      historyTypes: ["messageAdded"],
    });

    const newMessageIds = [];
    if (history.data.history) {
      history.data.history.forEach((h) => {
        h.messagesAdded?.forEach((m) => newMessageIds.push(m.message.id));
      });
    }

    console.log(`🔄 Found ${newMessageIds.length} new emails`);

    // 3️⃣ Fetch full message details and insert into DB
    const newMessagesData = [];
    const buffer = [];
    for (const id of newMessageIds) {
      const msg = await fetchMessageDetail(id);
      newMessagesData.push(msg);
      buffer.push(msg);
      if (buffer.length >= 100) {
        await insertMessagesBatch(buffer);
        buffer.length = 0;
      }
    }
    if (buffer.length > 0) await insertMessagesBatch(buffer);

    // 4️⃣ Update latest historyId for next delta
    if (history.data.historyId) {
      await client.query(
        `UPDATE gmail_sync_state SET history_id = $1 WHERE id = 1`,
        [history.data.historyId]
      );
    }

    // 5️⃣ Return new messages data along with count
    res.json({
      message: "✅ Delta sync completed",
      new_count: newMessagesData.length,
      data: newMessagesData,
    });
  } catch (err) {
    console.error("❌ Delta sync failed:", err.message);
    res.status(500).json({ message: "Delta sync failed", error: err.message });
  }
});


/**
 * ✅ Gmail Stats (Counts only)
 */
app.get("/sync-all-resume", async (req, res) => {
  try {
    // 1️⃣ Get last inserted email timestamp from DB
    const lastEmailRes = await client.query(
      "SELECT received_at FROM gmail_messages ORDER BY received_at asc LIMIT 1"
    );
    const lastEmail = lastEmailRes[0]?.received_at || "2000-01-01T00:00:00Z";

    console.log("⏳ Resuming sync from:", lastEmail);

    let pageToken = null;
    const allMessageIds = [];

    // 2️⃣ Fetch message IDs from Gmail after last email timestamp
    do {
      const data = await gmail.users.messages.list({
        userId: "me",
        q: `before:${Math.floor(new Date(lastEmail).getTime() / 1000)}`,
        maxResults: 500,
        pageToken,
      });

      if (data.data.messages) allMessageIds.push(...data.data.messages);

      pageToken = data.data.nextPageToken;
      await delay(200); // Gmail quota-friendly
    } while (pageToken);

    console.log(`📥 Found ${allMessageIds.length} new emails to sync`);

    // 3️⃣ Fetch details and insert in batches
    const buffer = [];
    for (let i = 0; i < allMessageIds.length; i++) {
      const msg = await fetchMessageDetail(allMessageIds[i].id);
      buffer.push(msg);

      if (buffer.length >= 100) {
        await insertMessagesBatch(buffer);
        buffer.length = 0;
      }

      if (i % 100 === 0) await delay(50); // pacing to avoid timeout
    }

    if (buffer.length > 0) await insertMessagesBatch(buffer);

    // 4️⃣ Save latest historyId for future delta sync
    const profile = await gmail.users.getProfile({ userId: "me" });
    if (profile.data.historyId) {
      await client.query(
        `INSERT INTO gmail_sync_state (id, history_id)
         VALUES (1, $1)
         ON CONFLICT (id) DO UPDATE SET history_id = $1`,
        [profile.data.historyId]
      );
      console.log("✅ Updated historyId:", profile.data.historyId);
    }

    res.json({ message: "✅ Resume full inbox sync completed", new_emails: allMessageIds.length });
  } catch (err) {
    console.error("❌ Resume sync failed:", err);
    res.status(500).json({ message: "Resume sync failed", error: err.message });
  }
});
app.get("/get-mails", async (req, res) => {
  try {
    // ✅ Get query params for pagination
    const limit = parseInt(req.query.limit ) || 50;  // default 50 emails
    const offset = parseInt(req.query.offset ) || 0; // default 0

    // ✅ Fetch emails from DB sorted by received_at DESC (newest first)
  const result = await client.query(
  `SELECT id, subject, sender, receiver, received_at
   FROM gmail_messages
   ORDER BY id desc
   LIMIT $1 OFFSET $2`,
  [limit, offset]
);


    res.json({
      message: "success",
      data: result,
      limit,
      offset,
      total: result.rowCount,
    });
  } catch (err) {
    console.error("❌ Failed to get mails:", err.message);
    res.status(500).json({ message: "Failed to get mails", error: err.message });
  }
});


app.get("/gmail-stats", async (req, res) => {
  try {
    const profile = await gmail.users.getProfile({ userId: "me" });
    const inboxCount = await gmail.users.messages.list({
      userId: "me",
      q: "in:inbox",
      maxResults: 1,
    });
    const sentCount = await gmail.users.messages.list({
      userId: "me",
      q: "in:sent",
      maxResults: 1,
    });
    const unreadCount = await gmail.users.messages.list({
      userId: "me",
      q: "is:unread",
      maxResults: 1,
    });

    res.json({
      message: "success",
      data: {
        total_inbox: inboxCount.data.resultSizeEstimate,
        total_sent: sentCount.data.resultSizeEstimate,
        total_unread: unreadCount.data.resultSizeEstimate,
        total_messages: profile.data.messagesTotal,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Stats failed", error: err.message });
  }
});




app.listen(process.env.PORT, () => {
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});
