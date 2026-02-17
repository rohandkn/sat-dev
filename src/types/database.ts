export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string | null
          onboarding_completed: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          onboarding_completed?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          onboarding_completed?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      categories: {
        Row: {
          id: string
          name: string
          slug: string
          description: string | null
          display_order: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          description?: string | null
          display_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          description?: string | null
          display_order?: number
          created_at?: string
        }
      }
      topics: {
        Row: {
          id: string
          category_id: string
          name: string
          slug: string
          description: string | null
          display_order: number
          prerequisite_topic_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          category_id: string
          name: string
          slug: string
          description?: string | null
          display_order?: number
          prerequisite_topic_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          category_id?: string
          name?: string
          slug?: string
          description?: string | null
          display_order?: number
          prerequisite_topic_id?: string | null
          created_at?: string
        }
      }
      student_models: {
        Row: {
          id: string
          user_id: string
          topic_id: string
          strengths: string[]
          weaknesses: string[]
          misconceptions: string[]
          mastery_level: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          topic_id: string
          strengths?: string[]
          weaknesses?: string[]
          misconceptions?: string[]
          mastery_level?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          topic_id?: string
          strengths?: string[]
          weaknesses?: string[]
          misconceptions?: string[]
          mastery_level?: number
          created_at?: string
          updated_at?: string
        }
      }
      learning_sessions: {
        Row: {
          id: string
          user_id: string
          topic_id: string
          state: string
          session_number: number
          pre_exam_score: number | null
          post_exam_score: number | null
          remediation_exam_score: number | null
          remediation_loop_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          topic_id: string
          state?: string
          session_number?: number
          pre_exam_score?: number | null
          post_exam_score?: number | null
          remediation_exam_score?: number | null
          remediation_loop_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          topic_id?: string
          state?: string
          session_number?: number
          pre_exam_score?: number | null
          post_exam_score?: number | null
          remediation_exam_score?: number | null
          remediation_loop_count?: number
          created_at?: string
          updated_at?: string
        }
      }
      exam_questions: {
        Row: {
          id: string
          session_id: string
          user_id: string
          exam_type: 'pre' | 'post' | 'remediation'
          question_number: number
          question_text: string
          choices: Json
          correct_answer: string
          explanation: string
          user_answer: string | null
          is_correct: boolean | null
          is_idk: boolean
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          user_id: string
          exam_type: 'pre' | 'post' | 'remediation'
          question_number: number
          question_text: string
          choices: Json
          correct_answer: string
          explanation: string
          user_answer?: string | null
          is_correct?: boolean | null
          is_idk?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          user_id?: string
          exam_type?: 'pre' | 'post' | 'remediation'
          question_number?: number
          question_text?: string
          choices?: Json
          correct_answer?: string
          explanation?: string
          user_answer?: string | null
          is_correct?: boolean | null
          is_idk?: boolean
          created_at?: string
        }
      }
      remediation_threads: {
        Row: {
          id: string
          question_id: string
          user_id: string
          session_id: string
          is_resolved: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          question_id: string
          user_id: string
          session_id: string
          is_resolved?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          question_id?: string
          user_id?: string
          session_id?: string
          is_resolved?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      remediation_messages: {
        Row: {
          id: string
          thread_id: string
          role: 'assistant' | 'user'
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          thread_id: string
          role: 'assistant' | 'user'
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          thread_id?: string
          role?: 'assistant' | 'user'
          content?: string
          created_at?: string
        }
      }
      lessons: {
        Row: {
          id: string
          session_id: string
          user_id: string
          lesson_type: 'initial' | 'remediation'
          content: string
          video_links: Json
          key_concepts: string[]
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          user_id: string
          lesson_type: 'initial' | 'remediation'
          content: string
          video_links?: Json
          key_concepts?: string[]
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          user_id?: string
          lesson_type?: 'initial' | 'remediation'
          content?: string
          video_links?: Json
          key_concepts?: string[]
          created_at?: string
        }
      }
      user_topic_progress: {
        Row: {
          id: string
          user_id: string
          topic_id: string
          status: 'locked' | 'available' | 'in_progress' | 'completed'
          best_score: number | null
          attempts: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          topic_id: string
          status?: 'locked' | 'available' | 'in_progress' | 'completed'
          best_score?: number | null
          attempts?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          topic_id?: string
          status?: 'locked' | 'available' | 'in_progress' | 'completed'
          best_score?: number | null
          attempts?: number
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
