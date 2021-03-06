import { Request } from 'express';
import BaseService from './baseService';
import Config from './config';
import { ClientIpAddressEmptyException, UnspecifiedException } from './exception';
import NewSyncLogsModel, { INewSyncLog, INewSyncLogsModel } from './newSyncLogsModel';
import { LogLevel } from './server';

// Implementation of data service for new sync log operations
export default class NewSyncLogsService extends BaseService<void> {
  // Creates a new sync log entry with the supplied request data
  public async createLog(req: Request): Promise<INewSyncLog> {
    // Get the client's ip address
    const clientIp = this.getClientIpAddress(req);
    if (!clientIp) {
      const err = new ClientIpAddressEmptyException();
      this.log(LogLevel.Error, 'Exception occurred in NewSyncLogsService.createLog', req, err);
      throw err;
    }

    // Create new sync log payload
    const newLogPayload: INewSyncLog = {
      ipAddress: clientIp
    };
    const newSyncLogsModel = new NewSyncLogsModel(newLogPayload);

    // Commit the payload to the db
    try {
      await newSyncLogsModel.save();
    }
    catch (err) {
      this.log(LogLevel.Error, 'Exception occurred in NewSyncLogsService.createLog', req, err);
      throw err;
    }

    return newLogPayload;
  }

  // Returns true/false depending on whether a given request's ip address has hit the limit for daily new syncs created
  public async newSyncsLimitHit(req: Request): Promise<boolean> {
    // Get the client's ip address
    const clientIp = this.getClientIpAddress(req);
    if (!clientIp) {
      const err = new ClientIpAddressEmptyException();
      this.log(LogLevel.Error, 'Exception occurred in NewSyncLogsService.newSyncsLimitHit', req, err);
      throw err;
    }

    let newSyncsCreated = -1;

    // Query the newsynclogs collection for the total number of logs for the given ip address
    try {
      newSyncsCreated = await NewSyncLogsModel.count({ ipAddress: clientIp }).exec();
    }
    catch (err) {
      this.log(LogLevel.Error, 'Exception occurred in NewSyncLogsService.newSyncsLimitHit', req, err);
      throw err;
    }

    // Ensure a valid count was returned
    if (newSyncsCreated < 0) {
      const err = new UnspecifiedException('New syncs created count cannot be less than zero');
      this.log(LogLevel.Error, 'Exception occurred in NewSyncLogsService.newSyncsLimitHit', req, err);
      throw err;
    }

    // Check returned count against config setting
    return newSyncsCreated >= Config.get().dailyNewSyncsLimit;
  }

  // Extracts the client's ip address from a given request
  private getClientIpAddress(req: Request): string {
    if (!req || !req.ip) {
      return;
    }

    return req.ip;
  }
}