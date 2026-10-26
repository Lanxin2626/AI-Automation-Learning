const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const { Pool } = require('pg');
const { z } = require('zod');
const { zodTextFormat } = require('openai/helpers/zod');

require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT,
});

const enquiryIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const app = express();
const PORT = 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const enquiryQuerySchema = z.object({
  priority: z.enum(['low', 'medium', 'high']).optional(),

  intent: z
    .enum([
      'test_drive',
      'purchase',
      'general_enquiry',
      'service',
    ])
    .optional(),

  page: z.coerce.number().int().positive().default(1),

  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

const updateEnquirySchema = z.object({
  priority: z.enum(['low', 'medium', 'high']).optional(),

  assignedTeam: z
    .enum([
      'Test Drive Team',
      'Sales Team',
      'Customer Service Team',
      'Service Team',
      'General Team',
    ])
    .optional(),
});

const enquiryAnalysisSchema = z.object({
  intent: z.enum(['test_drive', 'purchase', 'general_enquiry', 'service']),
  model: z.string().nullable(),
  priority: z.enum(['low', 'medium', 'high']),
});

const aiRequestSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Message is required.')
    .max(2000, 'Message is too long.')
    .refine(
      (value) => !/^\d+$/.test(value),
      'Message cannot contain only numbers.'
    ),
});

app.use(cors());
app.use(express.json());

app.post('/api/ai', async (req, res) => {
  try {

    const validation = aiRequestSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body.',
        details: validation.error.issues,
      });
    }
    const { message } = validation.data;

    const response = await openai.responses.parse({
      model: 'gpt-5.5',

      input: [
        {
          role: 'system',
          content: `
        Analyse customer enquiries.

        Determine:
        - intent
        - vehicle model
        - priority

        If no vehicle model is mentioned, use null.
      `,
        },
        {
          role: 'user',
          content: message,
        },
      ],

      text: {
        format: zodTextFormat(enquiryAnalysisSchema, 'enquiry_analysis'),
      },
    });

    const aiResult = response.output_parsed;
    let assignedTeam;

    switch (aiResult.intent) {
      case 'test_drive':
        // Handle test drive intent
        assignedTeam = 'Test Drive Team';
        break;
      case 'purchase':
        // Handle purchase intent
        assignedTeam = 'Sales Team';
        break;
      case 'general_enquiry':
        // Handle general enquiry intent
        assignedTeam = 'Customer Service Team';
        break;
      case 'service':
        // Handle service intent
        assignedTeam = 'Service Team';
        break;
      default:
        // Handle unknown intent
        assignedTeam = 'General Team';
        break;
    }

    let action;

    switch (aiResult.priority) {
      case 'low':
        action = 'Add to follow-up queue';
        break;
      case 'medium':
        action = 'Contact customer today';
        break;
      case 'high':
        action = 'Contact customer immediately';
        break;
      default:
        action = 'Undetermined';
        break;
    }

    await pool.query(
      `
  INSERT INTO enquiries
  (
    message,
    intent,
    model,
    priority,
    assigned_team,
    action
  )
  VALUES ($1, $2, $3, $4, $5, $6)
  `,
      [message, aiResult.intent, aiResult.model, aiResult.priority, assignedTeam, action]
    );

    res.json({
      success: true,
      reply: aiResult,
      assignedTeam,
      action,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to get AI response.',
    });
  }
});

app.get('/api/enquiries', async (req, res) => {
  try {
    const validation = enquiryQuerySchema.safeParse(req.query);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid query parameters.',
        details: validation.error.issues,
      });
    }

    const { priority, intent, page, pageSize } = validation.data;

    const offset = (page - 1) * pageSize;

    const values = [];
    const conditions = [];

    if (priority) {
      values.push(priority);
      conditions.push(`priority = $${values.length}`);
    }

    if (intent) {
      values.push(intent);
      conditions.push(`intent = $${values.length}`);
    }

    let whereClause = '';

    if (conditions.length > 0) {
      whereClause = ' WHERE ' + conditions.join(' AND ');
    }

    // 1. 先查总数
    const countResult = await pool.query(`SELECT COUNT(*) FROM enquiries${whereClause}`, values);

    const total = Number(countResult.rows[0].count);

    // 2. 再查当前页的数据
    const dataValues = [...values];

    dataValues.push(pageSize);
    const limitPlaceholder = `$${dataValues.length}`;

    dataValues.push(offset);
    const offsetPlaceholder = `$${dataValues.length}`;

    const result = await pool.query(
      `
      SELECT *
      FROM enquiries
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limitPlaceholder}
      OFFSET ${offsetPlaceholder}
      `,
      dataValues
    );

    const totalPages = Math.ceil(total / pageSize);

    res.json({
      success: true,
      page,
      pageSize,
      total,
      totalPages,
      enquiries: result.rows,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch enquiries.',
    });
  }
});

app.get('/api/enquiries/:id', async (req, res) => {
  const id = req.params.id;

  try {
    const result = await pool.query('SELECT * FROM enquiries WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Enquiry not found.',
      });
    }

    res.json({
      success: true,
      enquiry: result.rows[0],
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch enquiry.',
    });
  }
});

app.patch('/api/enquiries/:id', async (req, res) => {
  try {
    const id = req.params.id;

    const validation = updateEnquirySchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body.',
        details: validation.error.issues,
      });
    }

    const { priority, assignedTeam } = validation.data;

    if (priority === undefined && assignedTeam === undefined) {
      return res.status(400).json({
        success: false,
        error: 'No fields provided to update.',
      });
    }

    const result = await pool.query(
      `
      UPDATE enquiries
      SET
        priority = COALESCE($1, priority),
        assigned_team = COALESCE($2, assigned_team)
      WHERE id = $3
      RETURNING *
      `,
      [priority, assignedTeam, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Enquiry not found.',
      });
    }

    res.json({
      success: true,
      enquiry: result.rows[0],
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to update enquiry.',
    });
  }
});

app.delete('/api/enquiries/:id', async (req, res) => {
  try {
    const id = req.params.id;

    const result = await pool.query(
      `
      DELETE FROM enquiries
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Enquiry not found.',
      });
    }

    res.json({
      success: true,
      deletedEnquiry: result.rows[0],
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to delete enquiry.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
