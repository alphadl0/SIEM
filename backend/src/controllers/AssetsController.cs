using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using backend.src.services;
using Microsoft.Extensions.Logging;

namespace backend.src.controllers
{
    [ApiController]
    [Route("api")]
    [Authorize(Policy = "SecurityTeamPolicy")]
    public class AssetsController : ControllerBase
    {
        private readonly AssetService _assetService;
        private readonly ILogger<AssetsController> _logger;

        public AssetsController(AssetService assetService, ILogger<AssetsController> logger)
        {
            _assetService = assetService;
            _logger = logger;
        }

        [HttpGet("vm-statuses")]
        public async Task<IActionResult> GetVmStatuses(CancellationToken cancellationToken)
        {
            _logger.LogInformation("Fetch VM Statuses");
            var result = await _assetService.GetVmStatusesAsync(cancellationToken);
            return Ok(result);
        }

        [HttpGet("sql-statuses")]
        public async Task<IActionResult> GetSqlStatuses(CancellationToken cancellationToken)
        {
            _logger.LogInformation("Fetch SQL Statuses");
            var result = await _assetService.GetSqlStatusesAsync(cancellationToken);
            return Ok(result);
        }
    }
}