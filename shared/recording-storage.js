/**
 * Recording Storage Service
 * Saves call recordings to Supabase Storage
 */

class RecordingStorageService {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
  }

  /**
   * Save recording blob to Supabase Storage
   */
  async saveRecording(consultationId, recordingBlob, metadata = {}) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `consultation_${consultationId}_${timestamp}.webm`;
      const bucketName = 'consultation-recordings';

      // Ensure bucket exists
      await this.ensureBucketExists(bucketName);

      // Upload the file
      const { data, error } = await this.supabase.storage
        .from(bucketName)
        .upload(fileName, recordingBlob, {
          contentType: 'audio/webm',
          metadata: {
            consultationId,
            duration: metadata.duration || 0,
            recordedAt: new Date().toISOString(),
            ...metadata
          }
        });

      if (error) {
        console.error('Error uploading recording:', error);
        throw error;
      }

      console.log('Recording saved:', fileName);

      // Save recording metadata to database
      await this.saveRecordingMetadata(consultationId, fileName, recordingBlob.size, metadata);

      return {
        fileName,
        path: data.path,
        size: recordingBlob.size
      };
    } catch (error) {
      console.error('Error saving recording:', error);
      throw error;
    }
  }

  /**
   * Ensure storage bucket exists
   */
  async ensureBucketExists(bucketName) {
    try {
      const { data: buckets } = await this.supabase.storage.listBuckets();
      const bucketExists = buckets?.some(b => b.name === bucketName);

      if (!bucketExists) {
        await this.supabase.storage.createBucket(bucketName, {
          public: false
        });
        console.log(`Bucket ${bucketName} created`);
      }
    } catch (error) {
      console.log('Bucket already exists or error:', error.message);
    }
  }

  /**
   * Save recording metadata to database
   */
  async saveRecordingMetadata(consultationId, fileName, fileSize, metadata = {}) {
    try {
      // Get consultation details with faculty and student info
      const { data: consultationData } = await this.supabase
        .from('consultations')
        .select('faculty_id, student_id')
        .eq('id', consultationId)
        .single();

      if (consultationData) {
        // Try to get faculty name
        const { data: facultyData } = await this.supabase
          .from('faculty')
          .select('name')
          .eq('id', consultationData.faculty_id)
          .single()
          .catch(() => ({ data: null }));

        // Try to get student name
        const { data: studentData } = await this.supabase
          .from('students')
          .select('name')
          .eq('id', consultationData.student_id)
          .single()
          .catch(() => ({ data: null }));

        // Add names to metadata
        metadata.faculty_name = facultyData?.name || consultationData.faculty_id;
        metadata.student_name = studentData?.name || consultationData.student_id;
      }

      const { error } = await this.supabase
        .from('consultation_recordings')
        .insert({
          consultation_id: consultationId,
          file_name: fileName,
          file_size: fileSize,
          recorded_at: new Date().toISOString(),
          metadata: metadata
        });

      if (error) {
        console.error('Error saving recording metadata:', error);
        // Don't throw - recording is still saved in storage
      }
    } catch (error) {
      console.log('Note: Recording metadata not saved to database, but file is stored:', error.message);
    }
  }

  /**
   * Get signed URL for downloading recording
   */
  async getRecordingUrl(fileName, expiresIn = 3600) {
    try {
      const { data, error } = await this.supabase.storage
        .from('consultation-recordings')
        .createSignedUrl(fileName, expiresIn);

      if (error) {
        throw error;
      }

      return data.signedUrl;
    } catch (error) {
      console.error('Error getting recording URL:', error);
      return null;
    }
  }

  /**
   * Get all recordings for a consultation
   */
  async getConsultationRecordings(consultationId) {
    try {
      const { data, error } = await this.supabase
        .from('consultation_recordings')
        .select('*')
        .eq('consultation_id', consultationId)
        .order('recorded_at', { ascending: false });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching recordings:', error);
      return [];
    }
  }

  /**
   * Delete a recording
   */
  async deleteRecording(fileName) {
    try {
      const { error: storageError } = await this.supabase.storage
        .from('consultation-recordings')
        .remove([fileName]);

      if (storageError) {
        throw storageError;
      }

      // Remove from database
      const { error: dbError } = await this.supabase
        .from('consultation_recordings')
        .delete()
        .eq('file_name', fileName);

      if (dbError) {
        console.warn('Error deleting recording metadata:', dbError);
      }

      return true;
    } catch (error) {
      console.error('Error deleting recording:', error);
      return false;
    }
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RecordingStorageService;
}
