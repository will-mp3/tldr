import cron from 'node-cron';
import { emailProcessor } from './emailProcessor';
import { db } from './database';

class SchedulerService {
  private dailyProcessingJob: cron.ScheduledTask | null = null;
  private cleanupJob: cron.ScheduledTask | null = null;

  constructor() {
    this.setupJobs();
  }

  private setupJobs(): void {
    console.log('⏰ Setting up scheduled jobs...');

    // Daily newsletter processing at 10:00 AM EST (14:00 UTC)
    // Using UTC time since servers typically run in UTC
    this.dailyProcessingJob = cron.schedule('0 14 * * *', async () => {
      console.log('🕙 10:00 AM EST - Starting daily newsletter processing...');
      try {
        await emailProcessor.processEmails();
        console.log('✅ Daily newsletter processing completed');
      } catch (error) {
        console.error('❌ Daily newsletter processing failed:', error);
      }
    }, {
      scheduled: false, // Don't start immediately
      timezone: 'UTC'
    });

    // Daily cleanup at 2:00 AM EST (06:00 UTC) to remove expired articles
    this.cleanupJob = cron.schedule('0 6 * * *', async () => {
      console.log('🗑️ 2:00 AM EST - Starting daily cleanup...');
      try {
        const deletedCount = await db.cleanupExpiredArticles();
        console.log(`✅ Daily cleanup completed: ${deletedCount} articles removed`);
      } catch (error) {
        console.error('❌ Daily cleanup failed:', error);
      }
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    console.log('✅ Scheduled jobs configured:');
    console.log('  📧 Newsletter processing: Daily at 10:00 AM EST');
    console.log('  🗑️ Article cleanup: Daily at 2:00 AM EST');
  }

  start(): void {
    if (process.env.NODE_ENV === 'development') {
      console.log('🚧 Development mode - scheduled jobs disabled');
      console.log('💡 Use manual endpoints for testing:');
      console.log('   POST /api/articles/process-emails');
      console.log('   POST /api/articles/cleanup');
      return;
    }

    console.log('🚀 Starting scheduled jobs for production...');
    
    if (this.dailyProcessingJob) {
      this.dailyProcessingJob.start();
      console.log('✅ Daily newsletter processing job started');
    }

    if (this.cleanupJob) {
      this.cleanupJob.start();
      console.log('✅ Daily cleanup job started');
    }
  }

  stop(): void {
    console.log('⏹️ Stopping scheduled jobs...');
    
    if (this.dailyProcessingJob) {
      this.dailyProcessingJob.stop();
    }
    
    if (this.cleanupJob) {
      this.cleanupJob.stop();
    }
    
    console.log('✅ All scheduled jobs stopped');
  }

  // Manual trigger methods for testing
  async runNewsletterProcessing(): Promise<void> {
    console.log('🔄 Manual newsletter processing triggered...');
    await emailProcessor.processRecentEmails();
  }

  async runCleanup(): Promise<void> {
    console.log('🔄 Manual cleanup triggered...');
    const deletedCount = await db.cleanupExpiredArticles();
    console.log(`✅ Cleanup completed: ${deletedCount} articles removed`);
    return deletedCount;
  }

  getStatus() {
    const isDev = process.env.NODE_ENV === 'development';
    
    return {
      environment: process.env.NODE_ENV || 'development',
      scheduled_jobs_active: !isDev,
      jobs: {
        newsletter_processing: {
          schedule: '10:00 AM EST daily (15:00 UTC)',
          active: !isDev && this.dailyProcessingJob?.getStatus() === 'scheduled',
          next_run: isDev ? 'Manual only' : this.getNextRunTime('0 15 * * *')
        },
        cleanup: {
          schedule: '2:00 AM EST daily (07:00 UTC)', 
          active: !isDev && this.cleanupJob?.getStatus() === 'scheduled',
          next_run: isDev ? 'Manual only' : this.getNextRunTime('0 7 * * *')
        }
      },
      manual_endpoints: {
        newsletter_processing: 'POST /api/articles/process-emails',
        cleanup: 'POST /api/articles/cleanup'
      }
    };
  }

  private getNextRunTime(cronExpression: string): string {
    try {
      // Simple next run calculation - you could use a proper cron parser here
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      if (cronExpression.includes('15')) {
        tomorrow.setHours(15, 0, 0, 0); // 10 AM EST
      } else {
        tomorrow.setHours(7, 0, 0, 0);  // 2 AM EST
      }
      
      return tomorrow.toISOString();
    } catch (error) {
      return 'Unable to calculate';
    }
  }
}

export const schedulerService = new SchedulerService();
export default schedulerService;